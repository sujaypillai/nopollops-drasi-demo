import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl
});

export async function query<T extends pg.QueryResultRow>(text: string, values: unknown[] = []) {
  const result = await pool.query<T>(text, values);
  return result.rows;
}

export async function getDashboardState() {
  const [participantCount] = await query<{ count: string }>("select count(*)::text as count from participants");
  const submissions = await query<{ appName: string; teamName: string; image: string; status: string; createdAt: string }>(
    `select app_name as "appName", team_name as "teamName", image, status, created_at::text as "createdAt"
     from app_submissions
     order by created_at desc
     limit 50`
  );
  const riskyWorkloads = await query<{ appName: string; teamName: string; image: string; severity: string; mitigation: string; reason: string }>(
    `select s.app_name as "appName", s.team_name as "teamName", s.image, r.severity, r.mitigation, r.reason
     from app_submissions s
     join risky_images r on r.image = s.image and r.active = true
     order by s.created_at desc
     limit 50`
  );
  const affectedTeams = await query<{ teamName: string; riskyWorkloadCount: string; highestSeverity: string }>(
    `select s.team_name as "teamName",
            count(*)::text as "riskyWorkloadCount",
            max(r.severity) as "highestSeverity"
     from app_submissions s
     join risky_images r on r.image = s.image and r.active = true
     group by s.team_name
     order by count(*) desc, s.team_name`
  );
  const activeRisks = await query<{ image: string; severity: string; reason: string; mitigation: string }>(
    `select image, severity, reason, mitigation
     from risky_images
     where active = true
     order by created_at desc`
  );
  const voteRows = await query<{ vote: string; count: string }>(
    `select vote, count(*)::text as count
     from remediation_votes
     group by vote
     order by count(*) desc`
  );
  const reactions = await query<{ id: string; changeType: string; queryName: string; summary: string; createdAt: string }>(
    `select id::text, change_type as "changeType", query_name as "queryName", summary, created_at::text as "createdAt"
     from reaction_events
     order by created_at desc
     limit 25`
  );
  const drasiQueryStats = await query<{
    queryName: string;
    added: string;
    updated: string;
    deleted: string;
    total: string;
    lastSeenAt: string | null;
  }>(
    `select query_name as "queryName",
            count(*) filter (where change_type = 'added')::text as added,
            count(*) filter (where change_type = 'updated')::text as updated,
            count(*) filter (where change_type = 'deleted')::text as deleted,
            count(*)::text as total,
            max(created_at)::text as "lastSeenAt"
     from reaction_events
     where query_name in ('risky-running-workloads', 'affected-teams')
     group by query_name
     order by query_name`
  );
  const [lastDrasiEvent] = await query<{ lastSeenAt: string | null }>(
    `select max(created_at)::text as "lastSeenAt"
     from reaction_events
     where query_name in ('risky-running-workloads', 'affected-teams')`
  );

  return {
    participants: Number(participantCount?.count ?? 0),
    submissions,
    riskyWorkloads,
    affectedTeams: affectedTeams.map((row) => ({
      ...row,
      riskyWorkloadCount: Number(row.riskyWorkloadCount)
    })),
    activeRisks,
    votes: Object.fromEntries(voteRows.map((row) => [row.vote, Number(row.count)])),
    reactions,
    drasi: {
      sources: [
        {
          name: "nopollops-postgres",
          kind: "PostgreSQL Source",
          observes: ["participants", "app_submissions", "risky_images", "remediation_votes"],
          status: submissions.length > 0 || activeRisks.length > 0 ? "observing changes" : "configured"
        },
        {
          name: "nopollops-kubernetes",
          kind: "Kubernetes Source",
          observes: ["Pods", "Deployments", "Namespaces"],
          status: submissions.some((item) => item.status === "kubernetes") ? "observing workloads" : "configured"
        }
      ],
      queries: [
        {
          name: "risky-running-workloads",
          purpose: "Join running Kubernetes workloads with active risky image records",
          resultCount: riskyWorkloads.length
        },
        {
          name: "affected-teams",
          purpose: "Aggregate risky workload blast radius by team",
          resultCount: affectedTeams.length
        }
      ].map((queryInfo) => {
        const stats = drasiQueryStats.find((row) => row.queryName === queryInfo.name);
        return {
          ...queryInfo,
          added: Number(stats?.added ?? 0),
          updated: Number(stats?.updated ?? 0),
          deleted: Number(stats?.deleted ?? 0),
          totalChanges: Number(stats?.total ?? 0),
          lastSeenAt: stats?.lastSeenAt ?? null
        };
      }),
      reaction: {
        name: "nopollops-http",
        kind: "HTTP Reaction",
        deliveredEvents: drasiQueryStats.reduce((sum, row) => sum + Number(row.total), 0),
        lastSeenAt: lastDrasiEvent?.lastSeenAt ?? null
      }
    }
  };
}

export async function publishDashboard() {
  const { publish } = await import("./events.js");
  publish({ event: "dashboard", data: await getDashboardState() });
}
