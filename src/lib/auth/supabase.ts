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

/**
 * Verifies a staff ID + password pair. Returns the instructor on success, or
 * null when either is wrong — the two cases are deliberately indistinguishable.
 * Throws when Supabase is unreachable or misconfigured, so the caller can tell
 * "bad credentials" apart from "network down".
 */
export async function verifyAdvisor(
  staffId: string,
  password: string
): Promise<Instructor | null> {
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

  const rows: Instructor[] = await response.json();
  return rows.length > 0 ? rows[0] : null;
}
