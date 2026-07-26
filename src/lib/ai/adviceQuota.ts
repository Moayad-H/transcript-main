/**
 * Per-browser daily budget for AI advising notes.
 *
 * This is pacing, not enforcement. localStorage is trivially cleared, so it
 * stops an advisor from re-generating the same report ten times out of
 * curiosity — it does not stop anyone determined. The limits that actually bind
 * live in the `advise` Edge Function: a per-IP window and a global per-day
 * counter in Postgres (supabase/ai_advice_quota.sql).
 *
 * It exists because the feature is under evaluation. A visible "2 of 3 today"
 * makes the budget legible before the advisor hits it, which is friendlier than
 * a server 429 with no warning.
 */

const STORAGE_KEY = "ershad2:advice-usage";

/** Generations per browser per day while the feature is in testing. */
export const DAILY_ADVICE_LIMIT = 3;

interface Usage {
  day: string;
  count: number;
}

/** Local calendar day — the advisor's day, not the server's UTC day. */
function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function read(): Usage {
  const fresh: Usage = { day: today(), count: 0 };

  // Static export: this module can be imported during prerender, where there is
  // no window. Also covers Safari private mode, where localStorage throws.
  if (typeof window === "undefined") return fresh;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Usage).day !== "string" ||
      typeof (parsed as Usage).count !== "number"
    ) {
      return fresh;
    }

    const usage = parsed as Usage;
    // A stored day that isn't today has rolled over.
    return usage.day === fresh.day ? usage : fresh;
  } catch {
    return fresh;
  }
}

/** How many generations this browser has left today. */
export function getRemainingAdviceCount(): number {
  return Math.max(0, DAILY_ADVICE_LIMIT - read().count);
}

/**
 * Records one generation. Call it only once a request has actually been sent —
 * a failure the advisor never asked for should not cost them a slot.
 */
export function recordAdviceUse(): void {
  if (typeof window === "undefined") return;

  const usage = read();
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ day: usage.day, count: usage.count + 1 })
    );
  } catch {
    // Storage unavailable (private mode, quota). The server limits still apply.
  }
}
