# Supabase

Two kinds of server-side code live here, both for the same reason: the web app
is a static export (`output: "export"` in `next.config.ts`), so it has no server
of its own and cannot hold a secret.

## SQL (`*.sql`)

Run manually in the Supabase SQL editor. The login pair is ordered; the quota
file is independent of both.

1. `advisor_login.sql` — advisor directory + `verify_advisor(staff_id, password)`.
2. `advisor_login_rate_limit.sql` — re-creates `verify_advisor` with throttling.
3. `ai_advice_quota.sql` — global per-day cap behind the `advise` function.
   **Required before deploying `advise`** — the function fails closed if the
   counter is missing, so notes will return 503 until this is applied.

There is no migration tooling in this repo; the files are idempotent enough to
re-run, but read them before you do.

## Edge Functions (`functions/`)

Need the Supabase CLI (`brew install supabase/tap/supabase`), then a one-time
`supabase link --project-ref <ref>`.

### `advise` — AI advising notes

```bash
supabase secrets set GEMINI_API_KEY=...
supabase functions deploy advise
```

Optional secrets: `GEMINI_MODEL` (defaults to `gemini-2.0-flash`),
`ALLOWED_ORIGIN` (defaults to `*` — set it to the deployed site's origin),
`ADVICE_DAILY_LIMIT` (defaults to `50` — total model calls per UTC day across
every advisor).

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform; the
function uses them to reach `consume_advice_quota`, which is granted to
`service_role` only so a client cannot burn the day's budget without the model.

#### Usage limits

Three of them, deliberately layered — the feature is under evaluation and the
LLM free tier is the thing being protected:

| Limit | Where | Enforces |
| --- | --- | --- |
| 3 / browser / day | `src/lib/ai/adviceQuota.ts` (localStorage) | pacing only — clearable, not a boundary |
| 5 / IP / minute | `functions/advise` in-memory Map | one runaway client; resets when the isolate recycles |
| `ADVICE_DAILY_LIMIT` / day, global | `ai_advice_quota` table | the real cap — shared across advisors, isolates and networks |

To raise the cap after reviewing the output:

```bash
supabase secrets set ADVICE_DAILY_LIMIT=200
```

Today's spend: `select * from public.ai_advice_quota order by day desc limit 7;`

Run it locally against the same key:

```bash
supabase functions serve advise --env-file supabase/.env.local
```

The key must never appear in a `NEXT_PUBLIC_*` variable — that prefix ships the
value to every visitor of the static site.

Swapping LLM providers is contained to `functions/advise/index.ts` plus the
secret; the app calls it through `src/lib/ai/generateAdvice.ts`, whose signature
does not change.
