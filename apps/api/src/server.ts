import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config } from "./config.js";
import { addClient } from "./events.js";
import { getDashboardState, publishDashboard, query } from "./db.js";
import { createDemoDeployment } from "./kubernetes.js";

const app = express();

const teams = ["Team Satay", "Team Nasi Lemak", "Team Roti Canai", "Team Teh Tarik", "Team Durian", "Team Laksa"];

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/healthz", (_request, response) => {
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

    const [{ count }] = await query<{ count: string }>("select count(*)::text as count from app_submissions where status = 'kubernetes'");
    const shouldCreate = Number(count) < config.maxRealDeployments;
    const deployment = shouldCreate
      ? await createDemoDeployment({ appName: body.appName, image: body.image, teamName: participant.teamName })
      : { mode: "simulated" as const };

    const status = deployment.mode;
    await query(
      `insert into app_submissions (id, participant_id, team_name, app_name, namespace, image, image_tag, status)
       values ($1, $2, $3, $4, $5, $6, split_part($6, ':', 2), $7)`,
      [randomUUID(), body.participantId, participant.teamName, body.appName, config.demoNamespace, body.image, status]
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

app.post("/api/operator/reset", async (request, response, next) => {
  try {
    requireOperator(request.headers["x-operator-key"]);
    await query("truncate remediation_votes, reaction_events, app_submissions, risky_images, participants restart identity");
    await publishDashboard();
    response.status(202).json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "unexpected error";
  response.status(message === "unauthorized" ? 401 : 400).json({ error: message });
});

function requireOperator(value: string | string[] | undefined) {
  if (Array.isArray(value) || value !== config.operatorKey) {
    throw new Error("unauthorized");
  }
}

app.listen(config.port, () => {
  console.log(`NoPollOps API listening on ${config.port}`);
});

