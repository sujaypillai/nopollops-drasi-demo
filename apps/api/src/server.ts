import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { addClient } from "./events.js";
import { getDashboardState, publishDashboard, query } from "./db.js";
import { createDemoDeployment, deleteAllDemoDeployments, deleteDemoDeployment, patchDemoDeploymentImage } from "./kubernetes.js";

const app = express();

const teams = ["Team Satay", "Team Nasi Lemak", "Team Roti Canai", "Team Teh Tarik", "Team Durian", "Team Laksa"];
const demoNames = ["satay-api", "laksa-ledger", "durian-gateway", "teh-tarik-worker", "roti-router", "rendang-risk"];
const defaultRiskyImages = [
  {
    image: "ghcr.io/nopollops/openssl-demo:vulnerable",
    severity: "Critical",
    reason: "Known vulnerable OpenSSL demo image",
    mitigation: "Upgrade to ghcr.io/nopollops/openssl-demo:patched",
    active: true
  },
  {
    image: "ghcr.io/nopollops/payment-api:legacy",
    severity: "High",
    reason: "Legacy payment image flagged by the live risk catalog",
    mitigation: "Upgrade to ghcr.io/nopollops/payment-api:v2",
    active: false
  }
];

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_request, response) => {
  response.json({ ok: true });
});

app.get("/api/healthz", (_request, response) => {
  response.json({ ok: true });
});

app.get("/events", async (_request, response) => {
  response.setHeader("Content-Type", "text/event-stream");
  response.setHeader("Cache-Control", "no-cache");
  response.setHeader("Connection", "keep-alive");
  addClient(response);
  response.write(`event: dashboard\ndata: ${JSON.stringify(await getDashboardState())}\n\n`);
});

app.get("/api/dashboard", async (_request, response, next) => {
  try {
    response.json(await getDashboardState());
  } catch (error) {
    next(error);
  }
});

app.post("/api/participants", async (request, response, next) => {
  try {
    const body = z.object({ displayName: z.string().trim().min(1).max(40) }).parse(request.body);
    const id = randomUUID();
    const [{ count }] = await query<{ count: string }>("select count(*)::text as count from participants");
    const teamName = teams[Number(count) % teams.length];

    await query(
      `insert into participants (id, display_name, team_name)
       values ($1, $2, $3)`,
      [id, body.displayName, teamName]
    );
    await publishDashboard();
    response.status(201).json({ id, displayName: body.displayName, teamName });
  } catch (error) {
    next(error);
  }
});

app.post("/api/submissions", async (request, response, next) => {
  try {
    const body = z.object({
      participantId: z.string().uuid(),
      appName: z.string().trim().min(1).max(48),
      image: z.string().trim().min(1).max(240)
    }).parse(request.body);

    const [participant] = await query<{ teamName: string }>(
      `select team_name as "teamName" from participants where id = $1`,
      [body.participantId]
    );
    if (!participant) {
      response.status(404).json({ error: "participant not found" });
      return;
    }

    const [existingSubmission] = await query<{ appName: string }>(
      `select app_name as "appName"
       from app_submissions
       where lower(app_name) = lower($1)
         and status <> 'deleted'
       limit 1`,
      [body.appName]
    );
    if (existingSubmission) {
      response.status(409).json({ error: `App name "${body.appName}" is already used. Choose a unique app name for this deployment.` });
      return;
    }

    const [{ count }] = await query<{ count: string }>("select count(*)::text as count from app_submissions where status = 'kubernetes'");
    const shouldCreate = Number(count) < config.maxRealDeployments;
    const deployment = shouldCreate
      ? await createDemoDeployment({ appName: body.appName, image: body.image, teamName: participant.teamName })
      : { mode: "simulated" as const, name: body.appName.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 48) };

    const status = deployment.mode;
    await query(
      `insert into app_submissions (id, participant_id, team_name, app_name, namespace, deployment_name, image, image_tag, status)
       values ($1, $2, $3, $4, $5, $6, $7, split_part($7, ':', 2), $8)`,
      [randomUUID(), body.participantId, participant.teamName, body.appName, config.demoNamespace, deployment.name, body.image, status]
    );
    await publishDashboard();
    response.status(201).json({ appName: body.appName, status });
  } catch (error) {
    next(error);
  }
});

app.post("/api/votes", async (request, response, next) => {
  try {
    const body = z.object({
      participantId: z.string().uuid(),
      incidentKey: z.string().min(1).max(80),
      vote: z.string().min(1).max(80)
    }).parse(request.body);
    await query(
      `insert into remediation_votes (id, participant_id, incident_key, vote)
       values ($1, $2, $3, $4)`,
      [randomUUID(), body.participantId, body.incidentKey, body.vote]
    );
    await publishDashboard();
    response.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/drasi/reactions", async (request, response, next) => {
  try {
    const body = z.object({
      queryName: z.string().default("unknown"),
      changeType: z.string().default("changed"),
      summary: z.string().optional(),
      payload: z.unknown().optional()
    }).passthrough().parse(request.body);

    await query(
      `insert into reaction_events (id, query_name, change_type, summary, payload)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [
        randomUUID(),
        body.queryName,
        body.changeType,
        body.summary ?? "Drasi query result changed",
        JSON.stringify(body.payload ?? body)
      ]
    );
    await publishDashboard();
    response.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/operator/risky-images", async (request, response, next) => {
  try {
    requireOperator(request.headers["x-operator-key"]);
    const body = z.object({
      image: z.string().trim().min(1).max(240),
      severity: z.string().trim().min(1).max(40),
      reason: z.string().trim().min(1).max(240),
      mitigation: z.string().trim().min(1).max(240)
    }).parse(request.body);

    await query(
      `insert into risky_images (id, image, image_tag, severity, reason, mitigation, active)
       values ($1, $2, split_part($2, ':', 2), $3, $4, $5, true)
       on conflict (image) do update
       set severity = excluded.severity,
           reason = excluded.reason,
           mitigation = excluded.mitigation,
           active = true,
           resolved_at = null`,
      [randomUUID(), body.image, body.severity, body.reason, body.mitigation]
    );
    await publishDashboard();
    response.status(201).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/operator/risky-images/resolve", async (request, response, next) => {
  try {
    requireOperator(request.headers["x-operator-key"]);
    const body = z.object({
      image: z.string().trim().min(1).max(240)
    }).parse(request.body);

    await query(
      `update risky_images
       set active = false,
           resolved_at = now()
       where image = $1`,
      [body.image]
    );
    await publishDashboard();
    response.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.post("/api/operator/remediate", async (request, response, next) => {
  try {
    requireOperator(request.headers["x-operator-key"]);
    const body = z.object({
      action: z.enum(["upgrade", "quarantine", "delete"]),
      image: z.string().trim().min(1).max(240),
      replacementImage: z.string().trim().min(1).max(240).optional()
    }).parse(request.body);

    const submissions = await query<{ id: string; deploymentName: string | null }>(
      `select id::text, deployment_name as "deploymentName"
       from app_submissions
       where image = $1`,
      [body.image]
    );

    for (const submission of submissions) {
      if (!submission.deploymentName) continue;
      if (body.action === "upgrade") {
        const replacement = body.replacementImage ?? body.image.replace(/:(legacy|vulnerable|latest)$/i, ":patched");
        await patchDemoDeploymentImage({ deploymentName: submission.deploymentName, image: replacement });
        await query("update app_submissions set image = $1, image_tag = split_part($1, ':', 2), status = 'remediated' where id = $2", [
          replacement,
          submission.id
        ]);
      }
      if (body.action === "quarantine") {
        await query("update app_submissions set status = 'quarantined' where id = $1", [submission.id]);
      }
      if (body.action === "delete") {
        await deleteDemoDeployment({ deploymentName: submission.deploymentName });
        await query("update app_submissions set status = 'deleted' where id = $1", [submission.id]);
      }
    }

    await query(
      `insert into reaction_events (id, query_name, change_type, summary, payload)
       values ($1, 'operator-remediation', $2, $3, $4::jsonb)`,
      [
        randomUUID(),
        body.action,
        `Operator applied ${body.action} to ${submissions.length} matching workload(s)`,
        JSON.stringify(body)
      ]
    );
    await publishDashboard();
    response.status(202).json({ remediated: submissions.length });
  } catch (error) {
    next(error);
  }
});

app.post("/api/operator/seed", async (request, response, next) => {
  try {
    requireOperator(request.headers["x-operator-key"]);
    const body = z.object({
      count: z.number().int().min(1).max(60)
    }).default({ count: 12 }).parse(request.body ?? undefined);

    for (let index = 0; index < body.count; index += 1) {
      const participantId = randomUUID();
      const teamName = teams[index % teams.length];
      const appName = `${demoNames[index % demoNames.length]}-${index + 1}`;
      const image = index % 4 === 0 ? "ghcr.io/nopollops/payment-api:legacy" : "ghcr.io/nopollops/frontend:stable";
      const deployment = await createDemoDeployment({ appName, image, teamName });
      await query("insert into participants (id, display_name, team_name) values ($1, $2, $3)", [
        participantId,
        `Demo guest ${index + 1}`,
        teamName
      ]);
      await query(
        `insert into app_submissions (id, participant_id, team_name, app_name, namespace, deployment_name, image, image_tag, status)
         values ($1, $2, $3, $4, $5, $6, $7, split_part($7, ':', 2), $8)`,
        [randomUUID(), participantId, teamName, appName, config.demoNamespace, deployment.name, image, deployment.mode]
      );
    }

    await publishDashboard();
    response.status(201).json({ seeded: body.count });
  } catch (error) {
    next(error);
  }
});

app.post("/api/operator/reset", async (request, response, next) => {
  try {
    requireOperator(request.headers["x-operator-key"]);
    await query("set statement_timeout = '10s'");
    const cleanup = await deleteAllDemoDeployments();
    await query("delete from remediation_votes");
    await query("delete from reaction_events");
    await query("delete from app_submissions");
    await query("delete from risky_images");
    await query("delete from participants");
    await seedDefaultRiskyImages();
    await publishDashboard();
    response.status(202).json({ ok: true, workloadCleanup: cleanup });
  } catch (error) {
    next(error);
  }
});

async function seedDefaultRiskyImages() {
  for (const risk of defaultRiskyImages) {
    await query(
      `insert into risky_images (id, image, image_tag, severity, reason, mitigation, active)
       values ($1, $2, split_part($2, ':', 2), $3, $4, $5, $6)
       on conflict (image) do update
       set severity = excluded.severity,
           reason = excluded.reason,
           mitigation = excluded.mitigation,
           active = excluded.active,
           resolved_at = null`,
      [randomUUID(), risk.image, risk.severity, risk.reason, risk.mitigation, risk.active]
    );
  }
}

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const statusCode = getStatusCode(error);
  const message = error instanceof Error ? error.message : "Request failed. Please try again.";
  response.status(statusCode).json({ error: message });
});

function getStatusCode(error: unknown) {
  if (error instanceof z.ZodError) return 400;
  if (error instanceof Error && error.message === "unauthorized") return 401;
  if (error && typeof error === "object" && "statusCode" in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 600) return statusCode;
  }
  return 400;
}

function requireOperator(value: string | string[] | undefined) {
  if (Array.isArray(value) || value !== config.operatorKey) {
    throw new Error("unauthorized");
  }
}

app.listen(config.port, () => {
  console.log(`NoPollOps API listening on ${config.port}`);
});
