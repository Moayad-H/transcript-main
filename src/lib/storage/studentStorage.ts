/**
 * Hybrid Local-First & Cloud Storage for Advisor Advisee Records.
 *
 * Architecture:
 * - Local-First: Zero-latency IndexedDB ("ershad_db") ensures instant search & report
 *   loading without PDF re-parsing, full offline support, and $0 infrastructure cost.
 * - Cloud-Sync: When Supabase is configured and the advisor is online, advisee profiles
 *   are synced in the background to public.advisor_saved_students with Row-Level Security.
 * - Portability: Advisors can export or import full roster backups as JSON files anytime.
 */

import { Department, TranscriptData, AnalysisReport } from "@/types";
import { SavedStudentRecord } from "@/types/savedStudent";

const DB_NAME = "ershad_db";
const DB_VERSION = 1;
const STORE_NAME = "saved_students";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Opens or initializes the native browser IndexedDB.
 */
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      return reject(new Error("IndexedDB is not available in this environment."));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, {
          keyPath: ["staffId", "studentId"],
        });
        store.createIndex("idx_staff", "staffId", { unique: false });
        store.createIndex("idx_staff_updated", ["staffId", "updatedAt"], { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB."));
  });
}

/**
 * Creates a normalized SavedStudentRecord from parsed data and report.
 */
export function createSavedStudentRecord(
  staffId: string,
  transcriptData: TranscriptData,
  report: AnalysisReport
): SavedStudentRecord {
  const failedCount =
    report.withdrawnFailedCourses?.filter((c) => c.grade === "F").length ?? 0;

  const now = new Date().toISOString();

  return {
    staffId,
    studentId: transcriptData.studentId,
    studentName: transcriptData.studentName,
    department: transcriptData.department as Department,
    gpa: transcriptData.gpa ?? 0,
    totalCreditHours: report.totalCreditHours,
    onProbation: report.onProbation,
    failedCoursesCount: failedCount,
    transcriptData,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Saves or updates a single student record in local IndexedDB.
 */
export async function saveStudentLocal(record: SavedStudentRecord): Promise<void> {
  if (typeof window === "undefined") return;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    // Keep original createdAt if already present
    const getReq = store.get([record.staffId, record.studentId]);
    getReq.onsuccess = () => {
      const existing = getReq.result as SavedStudentRecord | undefined;
      const recordToSave: SavedStudentRecord = {
        ...record,
        createdAt: existing?.createdAt || record.createdAt,
        updatedAt: new Date().toISOString(),
      };

      const putReq = store.put(recordToSave);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

/**
 * Bulk saves a list of student records in local IndexedDB (e.g. after batch upload).
 */
export async function saveBatchStudentsLocal(records: SavedStudentRecord[]): Promise<void> {
  if (typeof window === "undefined" || records.length === 0) return;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    for (const record of records) {
      store.put(record);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Retrieves all saved students for a specific advisor from local IndexedDB.
 */
export async function getSavedStudentsLocal(staffId: string): Promise<SavedStudentRecord[]> {
  if (typeof window === "undefined") return [];

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("idx_staff");
    const request = index.getAll(IDBKeyRange.only(staffId));

    request.onsuccess = () => {
      const records = (request.result as SavedStudentRecord[]) || [];
      // Sort by updatedAt descending by default
      records.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolve(records);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Deletes a saved student record from local IndexedDB.
 */
export async function deleteSavedStudentLocal(staffId: string, studentId: string): Promise<void> {
  if (typeof window === "undefined") return;

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete([staffId, studentId]);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clears all saved students for an advisor in local IndexedDB.
 */
export async function clearAllSavedStudentsLocal(staffId: string): Promise<void> {
  if (typeof window === "undefined") return;

  const students = await getSavedStudentsLocal(staffId);
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);

    for (const s of students) {
      store.delete([staffId, s.studentId]);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Exports all saved students for an advisor as a downloadable JSON string.
 */
export async function exportStudentsJSON(staffId: string): Promise<string> {
  const students = await getSavedStudentsLocal(staffId);
  return JSON.stringify(
    {
      version: "1.0",
      staffId,
      exportedAt: new Date().toISOString(),
      count: students.length,
      students,
    },
    null,
    2
  );
}

/**
 * Imports students from a JSON backup file and merges them into local storage.
 * Returns the number of imported/updated records.
 */
export async function importStudentsJSON(staffId: string, jsonString: string): Promise<number> {
  const parsed = JSON.parse(jsonString);
  const rawList = Array.isArray(parsed) ? parsed : parsed.students;

  if (!Array.isArray(rawList)) {
    throw new Error("Invalid backup file: could not locate student records array.");
  }

  const validRecords: SavedStudentRecord[] = [];
  for (const item of rawList) {
    if (item && item.studentId && item.studentName && item.transcriptData) {
      validRecords.push({
        ...item,
        staffId, // attribute to currently logged-in advisor
        updatedAt: item.updatedAt || new Date().toISOString(),
      });
    }
  }

  if (validRecords.length > 0) {
    await saveBatchStudentsLocal(validRecords);
  }

  return validRecords.length;
}

// -----------------------------------------------------------------------------
// Cloud Sync (Supabase PostgreSQL)
// -----------------------------------------------------------------------------

interface SupabaseStudentRow {
  id?: string;
  staff_id: string;
  student_id: string;
  student_name: string;
  department: string;
  gpa: number | null;
  total_credit_hours: number | null;
  on_probation: boolean;
  failed_courses_count: number;
  transcript_data: TranscriptData;
  created_at?: string;
  updated_at: string;
}

function rowToRecord(row: SupabaseStudentRow): SavedStudentRecord {
  return {
    id: row.id,
    staffId: row.staff_id,
    studentId: row.student_id,
    studentName: row.student_name,
    department: row.department as Department,
    gpa: row.gpa ?? 0,
    totalCreditHours: row.total_credit_hours ?? 0,
    onProbation: Boolean(row.on_probation),
    failedCoursesCount: row.failed_courses_count ?? 0,
    transcriptData: row.transcript_data,
    createdAt: row.created_at || row.updated_at,
    updatedAt: row.updated_at,
  };
}

function recordToRow(record: SavedStudentRecord): SupabaseStudentRow {
  return {
    staff_id: record.staffId,
    student_id: record.studentId,
    student_name: record.studentName,
    department: record.department,
    gpa: record.gpa,
    total_credit_hours: record.totalCreditHours,
    on_probation: record.onProbation,
    failed_courses_count: record.failedCoursesCount,
    transcript_data: record.transcriptData,
    updated_at: record.updatedAt,
  };
}

/**
 * Pushes a single record or upsert to Supabase in the background.
 */
export async function syncStudentUpToCloud(record: SavedStudentRecord): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

  try {
    const row = recordToRow(record);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/advisor_saved_students`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(row),
    });

    return response.ok;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[studentStorage] Cloud push failed:", err);
    }
    return false;
  }
}

/**
 * Pushes multiple records to Supabase in a single batch upsert.
 */
export async function syncBatchStudentsUpToCloud(records: SavedStudentRecord[]): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || records.length === 0) return false;

  try {
    const rows = records.map(recordToRow);
    const response = await fetch(`${SUPABASE_URL}/rest/v1/advisor_saved_students`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(rows),
    });

    return response.ok;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[studentStorage] Batch cloud push failed:", err);
    }
    return false;
  }
}

/**
 * Deletes a student from Supabase.
 */
export async function deleteStudentFromCloud(staffId: string, studentId: string): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/advisor_saved_students?staff_id=eq.${encodeURIComponent(
        staffId
      )}&student_id=eq.${encodeURIComponent(studentId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      }
    );

    return response.ok;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[studentStorage] Cloud delete failed:", err);
    }
    return false;
  }
}

export interface SyncResult {
  success: boolean;
  localCount: number;
  syncedCount: number;
  error?: string;
}

/**
 * Performs a two-way synchronization between local IndexedDB and Supabase Cloud:
 * 1. Pulls remote students for this advisor.
 * 2. Compares update timestamps and merges newer records in both directions.
 * 3. Updates IndexedDB and pushes any unsynced local records up.
 */
export async function syncSavedStudents(staffId: string): Promise<SyncResult> {
  const localList = await getSavedStudentsLocal(staffId);

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return {
      success: true,
      localCount: localList.length,
      syncedCount: 0,
      error: "Supabase credentials not configured (running in local-only mode).",
    };
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/advisor_saved_students?staff_id=eq.${encodeURIComponent(
        staffId
      )}&select=*`,
      {
        method: "GET",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return {
        success: false,
        localCount: localList.length,
        syncedCount: 0,
        error: `Supabase returned status ${response.status}`,
      };
    }

    const remoteRows: SupabaseStudentRow[] = await response.json();
    const remoteRecords = remoteRows.map(rowToRecord);

    const localMap = new Map<string, SavedStudentRecord>(
      localList.map((item) => [item.studentId, item])
    );
    const remoteMap = new Map<string, SavedStudentRecord>(
      remoteRecords.map((item) => [item.studentId, item])
    );

    const toSaveLocally: SavedStudentRecord[] = [];
    const toPushToCloud: SavedStudentRecord[] = [];

    // Check remote records vs local
    for (const remote of remoteRecords) {
      const local = localMap.get(remote.studentId);
      if (!local) {
        toSaveLocally.push(remote);
      } else {
        const remoteTime = new Date(remote.updatedAt).getTime();
        const localTime = new Date(local.updatedAt).getTime();
        if (remoteTime > localTime) {
          toSaveLocally.push(remote);
        } else if (localTime > remoteTime) {
          toPushToCloud.push(local);
        }
      }
    }

    // Check local records not present in remote
    for (const local of localList) {
      if (!remoteMap.has(local.studentId)) {
        toPushToCloud.push(local);
      }
    }

    // Apply local saves
    if (toSaveLocally.length > 0) {
      await saveBatchStudentsLocal(toSaveLocally);
    }

    // Apply cloud pushes
    if (toPushToCloud.length > 0) {
      await syncBatchStudentsUpToCloud(toPushToCloud);
    }

    const updatedLocal = await getSavedStudentsLocal(staffId);

    return {
      success: true,
      localCount: updatedLocal.length,
      syncedCount: toSaveLocally.length + toPushToCloud.length,
    };
  } catch (err) {
    return {
      success: false,
      localCount: localList.length,
      syncedCount: 0,
      error: err instanceof Error ? err.message : "Sync connection failed",
    };
  }
}
