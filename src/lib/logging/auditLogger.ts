/**
 * Lightweight, non-blocking advisor audit logger for Supabase.
 *
 * Designed for ERSHAD2 static export:
 * - 0 extra npm dependencies (uses native fetch)
 * - Fire-and-forget: logging runs asynchronously in the background and never blocks UI operations
 * - Resilient: suppresses network/credential errors so advising flows are never interrupted
 */

import { loadSession } from "@/lib/auth/session";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type AuditAction =
  | "LOGIN"
  | "TRANSCRIPT_PARSED"
  | "BATCH_PROCESSED"
  | "DEPARTMENT_CHANGED"
  | "REPORT_DOWNLOADED"
  | "BATCH_PRINTED"
  | "STUDENT_PRINTED";

export interface AuditLogPayload {
  action: AuditAction;
  staffId?: string;
  advisorName?: string;
  studentId?: string;
  studentName?: string;
  department?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Sends an audit event to Supabase asynchronously without blocking the caller.
 */
export function logAdvisorAction(payload: AuditLogPayload): void {
  // Fire-and-forget in microtask/async background
  logAdvisorActionAsync(payload).catch((err) => {
    if (process.env.NODE_ENV === "development") {
      console.warn("[auditLogger] Failed to record audit log:", err);
    }
  });
}

/**
 * Underlying async logger. Can be awaited if necessary.
 */
export async function logAdvisorActionAsync(payload: AuditLogPayload): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // Supabase not configured in this environment; safely skip
    return false;
  }

  // Resolve advisor details from payload or current stored session
  let staffId = payload.staffId;
  let advisorName = payload.advisorName;

  if (!staffId || !advisorName) {
    const session = loadSession();
    if (session) {
      staffId = staffId || session.staff_id;
      advisorName = advisorName || session.name;
    }
  }

  if (!staffId || !advisorName) {
    // Cannot attribute action to an advisor
    return false;
  }

  const row = {
    staff_id: staffId,
    advisor_name: advisorName,
    action: payload.action,
    student_id: payload.studentId || null,
    student_name: payload.studentName || null,
    department: payload.department || null,
    metadata: payload.metadata || {},
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/advisor_audit_logs`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal", // Do not return inserted rows (minimizes bandwidth)
      },
      body: JSON.stringify(row),
    });

    return response.ok;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[auditLogger] Network error sending log:", error);
    }
    return false;
  }
}
