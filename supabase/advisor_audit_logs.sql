-- Advisor Audit Log table for ERSHAD.
--
-- Records advisor actions (transcript parsing, batch processing, department changes,
-- downloads, and prints) with complete attribution.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).

create extension if not exists pgcrypto with schema extensions;

-- 1. Table structure
create table if not exists public.advisor_audit_logs (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  staff_id     text not null,
  advisor_name text not null,
  action       text not null,
  student_id   text,
  student_name text,
  department   text,
  metadata     jsonb default '{}'::jsonb
);

-- 2. Indexes for fast dashboard querying & filtering
create index if not exists idx_advisor_audit_logs_created_at
  on public.advisor_audit_logs (created_at desc);

create index if not exists idx_advisor_audit_logs_staff_id
  on public.advisor_audit_logs (staff_id, created_at desc);

create index if not exists idx_advisor_audit_logs_student_id
  on public.advisor_audit_logs (student_id)
  where student_id is not null;

create index if not exists idx_advisor_audit_logs_action
  on public.advisor_audit_logs (action, created_at desc);

-- 3. Row Level Security: Immutable append-only audit trail
alter table public.advisor_audit_logs enable row level security;

-- Stop updates & deletions completely — audit logs cannot be altered or removed via the client API
revoke update, delete on public.advisor_audit_logs from anon, authenticated;

-- Allow anon clients (the frontend) to insert log entries
grant insert on public.advisor_audit_logs to anon, authenticated;

create policy "Allow anon to append audit logs"
  on public.advisor_audit_logs
  for insert
  to anon, authenticated
  with check (true);

-- Allow reading logs for authenticated users / dashboard queries
create policy "Allow reading audit logs"
  on public.advisor_audit_logs
  for select
  to anon, authenticated
  using (true);

grant select on public.advisor_audit_logs to anon, authenticated;
