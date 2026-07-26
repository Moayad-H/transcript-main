-- Advisor login for ERSHAD.
--
-- The frontend is a static export, so anything it holds is public. The shared
-- password therefore never reaches the client: it lives here as a bcrypt hash,
-- in a table anon cannot read, and is compared inside a SECURITY DEFINER
-- function that anon may only execute.
--
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).

create extension if not exists pgcrypto with schema extensions;

-- 1. Where the hash lives. RLS on with no policies = no client can read it.
create table if not exists public.advisor_auth (
  id            boolean primary key default true check (id),  -- single row
  password_hash text not null,
  updated_at    timestamptz not null default now()
);

alter table public.advisor_auth enable row level security;
revoke all on public.advisor_auth from anon, authenticated;

-- 2. Set the shared password. Replace the placeholder below with the real one,
--    run it, and do not commit the edited line.
insert into public.advisor_auth (id, password_hash)
values (true, extensions.crypt('REPLACE_WITH_THE_SHARED_PASSWORD', extensions.gen_salt('bf', 12)))
on conflict (id) do update
  set password_hash = excluded.password_hash,
      updated_at    = now();

-- 3. Stop anon from listing the staff directory. After this, the only way to
--    learn whether a staff ID exists is to also supply the correct password.
alter table public.instructors enable row level security;
revoke all on public.instructors from anon, authenticated;

-- 4. The login check. Returns one row on success, zero rows otherwise — the
--    caller cannot tell an unknown staff ID from a wrong password.
create or replace function public.verify_advisor(p_staff_id text, p_password text)
returns table (staff_id text, name text)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if not exists (
    select 1
    from public.advisor_auth a
    where a.password_hash = extensions.crypt(p_password, a.password_hash)
  ) then
    return;
  end if;

  return query
    select i.staff_id, i.name
    from public.instructors i
    where i.staff_id = p_staff_id
    limit 1;
end;
$$;

revoke all on function public.verify_advisor(text, text) from public;
grant execute on function public.verify_advisor(text, text) to anon;
