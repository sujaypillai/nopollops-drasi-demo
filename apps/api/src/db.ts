import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl
});

export async function query<T>(text: string, values: unknown[] = []) {
  const result = await pool.query<T>(text, values);
  return result.rows;
}

export async function getDashboardState() {
  const [participantCount] = await query<{ count: string }>("select count(*)::text as count from participants");
  const submissions = await query<{ appName: string; teamName: string; image: string; status: string }>(
    `select app_name as "appName", team_name as "teamName", image, status
     from app_submissions
     order by created_at desc
     limit 50`
  );
  const riskyWorkloads = await query<{ appName: string; teamName: string; image: string; severity: string; mitigation: string }>(
    `select s.app_name as "appName", s.team_name as "teamName", s.image, r.severity, r.mitigation
     from app_submissions s
     join risky_images r on r.image = s.image and r.active = true
     order by s.created_at desc
     limit 50`
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

  return {
    participants: Number(participantCount?.count ?? 0),
    submissions,
    riskyWorkloads,
    votes: Object.fromEntries(voteRows.map((row) => [row.vote, Number(row.count)])),
    reactions
  };
}

export async function publishDashboard() {
  const { publish } = await import("./events.js");
  publish({ event: "dashboard", data: await getDashboardState() });
}

