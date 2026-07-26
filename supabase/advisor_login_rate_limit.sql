-- Rate limiting for the advisor login gate.
--
-- Run this in the Supabase SQL editor AFTER advisor_login.sql has been applied.
-- It does not touch public.advisor_auth, so the stored password hash is
-- preserved -- no need to re-enter the shared password.
--
-- Why: anon can call verify_advisor() freely, and every call runs a bcrypt
-- comparison at cost 12 (~250ms of CPU by design). That is both the brute-force
-- defence and the DoS surface. This throttle rejects abusive callers BEFORE the
-- crypt() call, so a flood costs an index lookup instead of a hash.


-- 1. Attempt counter --------------------------------------------------------
-- One row per staff ID. RLS-locked like everything else: only the
-- SECURITY DEFINER function may read or write it.

create table if not exists public.advisor_login_throttle (
  key           text primary key,
  attempts      integer     not null default 0,
  window_start  timestamptz not null default now(),
  blocked_until timestamptz
);

alter table public.advisor_login_throttle enable row level security;
revoke all on public.advisor_login_throttle from anon, authenticated;

-- Supports the opportunistic prune at the bottom of the function.
create index if not exists advisor_login_throttle_window_start_idx
  on public.advisor_login_throttle (window_start);


-- 2. verify_advisor(), with the throttle in front of the hash ---------------
-- Return shape gains a third column, `throttled`:
--   success   -> one row  (staff_id, name, false)
--   bad creds -> no rows                       (ID and password stay
--                                               indistinguishable)
--   throttled -> one row  (null, null, true)
--
-- Telling the caller they are locked out leaks nothing about which factor was
-- wrong, and lets the UI say "too many attempts" instead of lying with
-- "incorrect password".

drop function if exists public.verify_advisor(text, text);

create function public.verify_advisor(p_staff_id text, p_password text)
returns table (staff_id text, name text, throttled boolean)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  -- Tuning. Generous enough that a fat-fingered advisor never notices.
  max_attempts  constant integer  := 10;
  window_length constant interval := interval '15 minutes';
  block_length  constant interval := interval '15 minutes';

  v_key   text;
  v_row   public.advisor_login_throttle%rowtype;
  v_match boolean;
begin
  -- Cheapest rejections first: malformed input never reaches bcrypt.
  if p_staff_id is null or p_password is null
     or length(p_staff_id) > 64 or length(p_password) > 128 then
    return;
  end if;

  v_key := lower(trim(p_staff_id));
  if v_key = '' then
    return;
  end if;

  -- Take the row lock up front so concurrent attempts on the same key
  -- serialise and cannot race the counter past the limit.
  insert into public.advisor_login_throttle (key)
  values (v_key)
  on conflict (key) do nothing;

  select * into v_row
  from public.advisor_login_throttle t
  where t.key = v_key
  for update;

  -- Locked out: bail before spending a hash.
  if v_row.blocked_until is not null and v_row.blocked_until > now() then
    return query select null::text, null::text, true;
    return;
  end if;

  -- Block expired, or the counting window rolled over: start fresh.
  if v_row.blocked_until is not null
     or v_row.window_start < now() - window_length then
    update public.advisor_login_throttle t
       set attempts = 0, window_start = now(), blocked_until = null
     where t.key = v_key;
    v_row.attempts := 0;
  end if;

  -- The expensive part, reached only by callers within their budget.
  select exists (
    select 1
    from public.advisor_auth a
    where a.password_hash = extensions.crypt(p_password, a.password_hash)
  ) into v_match;

  if v_match then
    select exists (
      select 1 from public.instructors i where i.staff_id = p_staff_id
    ) into v_match;
  end if;

  if v_match then
    -- Clean success: forget the failures.
    delete from public.advisor_login_throttle t where t.key = v_key;

    return query
      select i.staff_id, i.name, false
      from public.instructors i
      where i.staff_id = p_staff_id
      limit 1;
    return;
  end if;

  -- Failure: count it, and lock the key once the budget is spent.
  update public.advisor_login_throttle t
     set attempts      = t.attempts + 1,
         blocked_until = case when t.attempts + 1 >= max_attempts
                              then now() + block_length end
   where t.key = v_key;

  -- Opportunistic prune so the table cannot grow without bound from junk IDs.
  if random() < 0.01 then
    delete from public.advisor_login_throttle t
     where t.window_start < now() - (window_length + block_length)
       and (t.blocked_until is null or t.blocked_until < now());
  end if;

  return;
end;
$$;

revoke all on function public.verify_advisor(text, text) from public;
grant execute on function public.verify_advisor(text, text) to anon;


-- 3. Manual unlock, if an advisor gets stuck --------------------------------
--   delete from public.advisor_login_throttle where key = '7478';
