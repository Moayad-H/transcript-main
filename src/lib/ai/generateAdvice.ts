/**
 * Client entry point for AI advising notes.
 *
 * The app is a static export (`output: "export"` in next.config.ts) — there is
 * no Next.js server, so an LLM API key cannot live in this bundle. The key sits
 * in the `advise` Supabase Edge Function (see supabase/functions/advise), which
 * anon may invoke but never read behind — the same shape as `verify_advisor`
 * in src/lib/auth/supabase.ts.
 *
 * This file is the only place in the app that knows an LLM exists. Switching
 * providers (Gemini → Claude) changes the edge function and one secret; this
 * signature does not move.
 */

import { AdvicePayload } from "./anonymize";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type AdviceResult =
  | { status: "ok"; advice: string; remaining: number | null }
  /** Per-caller window: the same request will succeed in a minute. */
  | { status: "throttled" }
  /** The shared daily budget is spent; retrying today will not help. */
  | { status: "daily-limit"; message: string }
  | { status: "unavailable"; message: string };

/**
 * Generates advising notes for an already-anonymized report.
 *
 * Never throws for an expected failure — the report must stay readable when the
 * AI layer is down, so every outcome comes back as a status the caller renders.
 * "throttled" means the endpoint's rate limit is holding this caller off; it
 * says nothing about the payload.
 */
export async function generateAdvice(payload: AdvicePayload): Promise<AdviceResult> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      status: "unavailable",
      message:
        "AI notes are not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/advise`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return {
      status: "unavailable",
      message: "Could not reach the advising service. Check your connection.",
    };
  }

  let body: { advice?: unknown; remaining?: unknown; error?: unknown; reason?: unknown };
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  // 429 covers two different situations, and the advisor should not be told to
  // "wait a minute" when the shared budget for the day is gone.
  if (response.status === 429) {
    if (body.reason === "daily") {
      return {
        status: "daily-limit",
        message:
          typeof body.error === "string"
            ? body.error
            : "The daily limit for AI notes has been reached.",
      };
    }
    return { status: "throttled" };
  }

  if (!response.ok) {
    return {
      status: "unavailable",
      message: `The advising service returned an error (${response.status}).`,
    };
  }

  if (typeof body.advice !== "string" || body.advice.trim() === "") {
    return { status: "unavailable", message: "The advising service returned no notes." };
  }

  return {
    status: "ok",
    advice: body.advice.trim(),
    remaining: typeof body.remaining === "number" ? body.remaining : null,
  };
}
