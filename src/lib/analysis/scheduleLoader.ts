/**
 * Schedule Loader & Cache Manager
 * Loads default bundled semester schedules and merges with custom uploaded schedules in localStorage.
 */

import { GroupSchedule } from "@/types/schedule";

const STORAGE_KEY = "ershad_custom_schedules_v1";

let cachedSchedules: GroupSchedule[] | null = null;

/**
 * Load default bundled schedules from public directory
 */
export async function loadDefaultSchedules(): Promise<GroupSchedule[]> {
  try {
    const res = await fetch("/data/schedules/default_schedules.json");
    if (!res.ok) {
      console.warn("Could not fetch default_schedules.json, status:", res.status);
      return [];
    }
    const data: GroupSchedule[] = await res.json();
    return data;
  } catch (err) {
    console.error("Error loading default schedules:", err);
    return [];
  }
}

/**
 * Load user-uploaded custom schedules from localStorage
 */
export function loadCustomSchedules(): GroupSchedule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error("Error reading custom schedules from localStorage:", err);
    return [];
  }
}

/**
 * Save user-uploaded custom schedules to localStorage
 */
export function saveCustomSchedules(schedules: GroupSchedule[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(schedules));
    cachedSchedules = null; // bust cache
  } catch (err) {
    console.error("Error saving custom schedules to localStorage:", err);
  }
}

/**
 * Clear custom schedules and revert to default
 */
export function clearCustomSchedules(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  cachedSchedules = null;
}

/**
 * Get all available schedules (custom schedules override default ones with the same groupName)
 */
export async function getAllSchedules(): Promise<GroupSchedule[]> {
  if (cachedSchedules) {
    return cachedSchedules;
  }

  const defaultList = await loadDefaultSchedules();
  const customList = loadCustomSchedules();

  // Merge map keyed by groupName
  const merged = new Map<string, GroupSchedule>();
  for (const s of defaultList) {
    merged.set(s.groupName.toUpperCase(), s);
  }
  for (const s of customList) {
    merged.set(s.groupName.toUpperCase(), s);
  }

  cachedSchedules = Array.from(merged.values());
  return cachedSchedules;
}
