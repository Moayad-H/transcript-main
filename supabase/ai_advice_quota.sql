-- Global daily cap for AI advising notes.
--
-- Run this in the Supabase SQL editor (order does not matter relative to the
-- advisor_login files -- it shares nothing with them).
--
-- Why a table and not another in-memory counter: the `advise` Edge Function
-- already rate-limits per IP in memory, but that Map is per-isolate and resets
-- whenever the isolate recycles. It stops one runaway client; it cannot bound
-- what a dozen advisors on a dozen networks spend against the LLM's free tier.
-- Only shared state can do that, and Postgres is the shared state this project
-- already has.
--
-- The counter is a single row per UTC day, so the table stays tiny and the
-- window rolls over on its own.


-- 1. Counter ----------------------------------------------------------------
-- RLS-locked like advisor_login_throttle: nothing but the SECURITY DEFINER
-- function below may read or write it. anon must not be able to read the count
-- (it reveals usage patterns) nor increment it without going through the cap.

create table if not exists public.ai_advice_quota (
  day   date    primary key default (now() at time zone 'utc')::date,
  used  integer not null default 0
);

alter table public.ai_advice_quota enable row level security;
revoke all on public.ai_advice_quota from anon, authenticated;


-- 2. consume_advice_quota(p_limit) ------------------------------------------
-- Atomically claims one unit of today's budget.
--
--   allowed = true   -> the caller may spend a model call; `used` counts it
--   allowed = false  -> today's budget is gone; nothing was incremented
--
-- The insert..on conflict do update with a WHERE guard is the whole trick: the
-- increment and the limit check are one statement, so two concurrent calls at
-- the boundary cannot both be allowed.

create or replace function public.consume_advice_quota(p_limit integer)
returns table (allowed boolean, used integer, day_limit integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'utc')::date;
  v_used  integer;
begin
  if p_limit is null or p_limit < 0 then
    p_limit := 0;
  end if;

  insert into public.ai_advice_quota (day, used)
  values (v_today, 1)
  on conflict (day) do update
     set used = public.ai_advice_quota.used + 1
   where public.ai_advice_quota.used < p_limit
  returning ai_advice_quota.used into v_used;

  if v_used is null then
    -- The WHERE guard suppressed the update: the row exists and is at or over
    -- the limit. Report the current figure without touching it.
    select q.used into v_used
      from public.ai_advice_quota q
     where q.day = v_today;

    return query select false, coalesce(v_used, 0), p_limit;
    return;
  end if;

  -- A fresh day was inserted with used = 1. If the limit is 0, that insert
  -- should not have been allowed -- roll it back to zero and refuse.
  if v_used > p_limit then
    update public.ai_advice_quota q set used = p_limit where q.day = v_today;
    return query select false, p_limit, p_limit;
    return;
  end if;

  -- Keep only a short history; this table is a budget, not an audit log.
  if random() < 0.01 then
    delete from public.ai_advice_quota q where q.day < v_today - 30;
  end if;

  return query select true, v_used, p_limit;
end;
$$;

-- Deliberately NOT granted to anon. The Edge Function calls this with the
-- service role key it is issued at runtime. If anon could execute it, a client
-- could burn the whole day's budget in a loop without ever calling the model.
revoke all on function public.consume_advice_quota(integer) from public, anon, authenticated;
grant execute on function public.consume_advice_quota(integer) to service_role;


-- 3. Operations -------------------------------------------------------------
-- Today's usage:
--   select * from public.ai_advice_quota order by day desc limit 7;
-- Reset today (e.g. after a bad test run):
--   update public.ai_advice_quota set used = 0
--    where day = (now() at time zone 'utc')::date;
