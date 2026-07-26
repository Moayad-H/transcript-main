/**
 * Advisor login against Supabase.
 *
 * The app is a static export (`output: "export"` in next.config.ts) — there is no
 * server, so anything this file holds is public. The shared password is therefore
 * never stored here: it is checked inside the `verify_advisor` Postgres function
 * (see supabase/advisor_login.sql), which anon may execute but not read behind.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export interface Instructor {
  staff_id: string;
  name: string;
}

/** Raw row shape returned by the RPC. `throttled` marks a rate-limited caller. */
interface VerifyAdvisorRow {
  staff_id: string | null;
  name: string | null;
  throttled?: boolean;
}

export type VerifyAdvisorResult =
  | { status: "ok"; instructor: Instructor }
  | { status: "invalid" }
  | { status: "throttled" };

/**
 * Verifies a staff ID + password pair.
 *
 * A wrong ID and a wrong password both come back as "invalid" — the two cases
 * are deliberately indistinguishable. "throttled" means the rate limit in
 * supabase/advisor_login_rate_limit.sql has locked this staff ID out for a
 * while; it says nothing about whether the credentials were right.
 *
 * Throws when Supabase is unreachable or misconfigured, so the caller can tell
 * "bad credentials" apart from "network down".
 */
export async function verifyAdvisor(
  staffId: string,
  password: string
): Promise<VerifyAdvisorResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_advisor`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_staff_id: staffId, p_password: password }),
  });

  if (!response.ok) {
    throw new Error(`Could not reach the staff directory (${response.status}).`);
  }

  const rows: VerifyAdvisorRow[] = await response.json();
  if (rows.length === 0) {
    return { status: "invalid" };
  }

  const row = rows[0];
  // `throttled` is absent if the rate-limit migration has not been applied yet,
  // in which case a returned row is always a successful match.
  if (row.throttled) {
    return { status: "throttled" };
  }

  return {
    status: "ok",
    instructor: { staff_id: row.staff_id as string, name: row.name as string },
  };
}
