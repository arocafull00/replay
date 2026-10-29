create table if not exists events (
  id bigint generated always as identity primary key,
  user_id text not null,
  type text not null check (type in ('open', 'session', 'clip')),
  created_at timestamptz not null default now()
);
-- Nullable for historical rows. Every new client event has a stable id for retries.
alter table events add column if not exists event_id text;
create unique index if not exists events_dedup on events (user_id, event_id);
create index if not exists events_created_at on events (created_at);
create index if not exists events_user_id on events (user_id);
