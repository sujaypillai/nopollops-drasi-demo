create extension if not exists "uuid-ossp";

create table if not exists participants (
  id uuid primary key,
  display_name text not null,
  team_name text not null,
  joined_at timestamptz not null default now()
);

create table if not exists app_submissions (
  id uuid primary key,
  participant_id uuid references participants(id) on delete cascade,
  team_name text not null,
  app_name text not null,
  namespace text not null,
  deployment_name text,
  image text not null,
  image_tag text,
  desired_replicas integer not null default 1,
  created_at timestamptz not null default now(),
  status text not null default 'simulated'
);

create table if not exists risky_images (
  id uuid primary key,
  image text not null unique,
  image_tag text,
  severity text not null,
  reason text not null,
  mitigation text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists remediation_votes (
  id uuid primary key,
  participant_id uuid references participants(id) on delete cascade,
  incident_key text not null,
  vote text not null,
  created_at timestamptz not null default now()
);

create table if not exists reaction_events (
  id uuid primary key,
  query_name text not null,
  change_type text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_app_submissions_image on app_submissions(image);
create index if not exists idx_app_submissions_status on app_submissions(status);
create index if not exists idx_risky_images_active_image on risky_images(active, image);
create index if not exists idx_votes_incident on remediation_votes(incident_key);
