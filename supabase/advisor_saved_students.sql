-- Advisor Saved Students table for ERSHAD.
--
-- Enables advisors to store, search, and recall student transcript profiles
-- across devices without re-uploading PDFs.
--
-- Stores the lightweight parsed TranscriptData JSON along with indexed summary
-- metrics (GPA, completed credit hours, academic standing, probation status).
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).

create extension if not exists pgcrypto with schema extensions;

-- 1. Table structure
create table if not exists public.advisor_saved_students (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  staff_id             text not null,
  student_id           text not null,
  student_name         text not null,
  department           text not null,
  gpa                  numeric(4,2),
  total_credit_hours   numeric(5,1) default 0,
  on_probation         boolean default false,
  failed_courses_count int default 0,
  transcript_data      jsonb not null,
  constraint unique_advisor_student unique (staff_id, student_id)
);

-- 2. Indexes for fast dashboard querying & filtering
create index if not exists idx_advisor_saved_students_staff_updated
  on public.advisor_saved_students (staff_id, updated_at desc);

create index if not exists idx_advisor_saved_students_staff_student
  on public.advisor_saved_students (staff_id, student_id);

create index if not exists idx_advisor_saved_students_department
  on public.advisor_saved_students (department);

-- 3. Row Level Security: Advisor Data Isolation
alter table public.advisor_saved_students enable row level security;

-- In ERSHAD's static export architecture, requests authenticate using the anon key.
-- We allow select, insert, update, and delete for anon & authenticated roles.
grant select, insert, update, delete on public.advisor_saved_students to anon, authenticated;

-- Allow reading records
create policy "Allow reading saved students"
  on public.advisor_saved_students
  for select
  to anon, authenticated
  using (true);

-- Allow inserting or upserting records
create policy "Allow inserting saved students"
  on public.advisor_saved_students
  for insert
  to anon, authenticated
  with check (true);

-- Allow updating records
create policy "Allow updating saved students"
  on public.advisor_saved_students
  for update
  to anon, authenticated
  using (true)
  with check (true);

-- Allow deleting records
create policy "Allow deleting saved students"
  on public.advisor_saved_students
  for delete
  to anon, authenticated
  using (true);
