/**
 * Advisor session, persisted in localStorage so a reload doesn't force a re-login.
 *
 * This is a access gate, not a security boundary: with a static export the shared
 * password and anon key are both present in the client bundle.
 */

import type { Instructor } from "./supabase";

const STORAGE_KEY = "ershad.advisor";

export type AdvisorSession = Instructor;

export function loadSession(): AdvisorSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<AdvisorSession>;
    if (typeof parsed?.staff_id !== "string" || typeof parsed?.name !== "string") {
      return null;
    }
    return { staff_id: parsed.staff_id, name: parsed.name };
  } catch {
    return null;
  }
}

export function saveSession(session: AdvisorSession): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
