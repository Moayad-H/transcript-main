/**
 * Department Plan Mapper
 * Maps course codes to their designated term (Semester 1 to 8) within department study plans.
 */

import { Department } from "@/types";
import { canonicalizeCode } from "@/lib/constants";
import { DEPARTMENT_COURSE_SEMESTERS } from "./departmentPlanData";

/**
 * Clean course code for consistent map lookup
 */
export function normalizeCode(code: string): string {
  return canonicalizeCode(code).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Returns the planned semester (1-8) for a given course code in a department.
 * If not found in the specified department, searches across other departments as fallback.
 */
export function getCourseTerm(
  courseCode: string,
  preferredDept?: Department | string
): number | null {
  const norm = normalizeCode(courseCode);
  if (!norm) return null;

  // 1. Check in preferred department
  if (preferredDept && DEPARTMENT_COURSE_SEMESTERS[preferredDept]) {
    const sem = DEPARTMENT_COURSE_SEMESTERS[preferredDept][norm];
    if (typeof sem === "number") {
      return sem;
    }
  }

  // 2. Check across all departments
  for (const dept of Object.keys(DEPARTMENT_COURSE_SEMESTERS)) {
    const sem = DEPARTMENT_COURSE_SEMESTERS[dept][norm];
    if (typeof sem === "number") {
      return sem;
    }
  }

  // 3. Fallback inference based on course level digits (e.g. CCS1302 -> 1, CCS2303 -> 2/3, CCS3203 -> 5)
  const numMatch = norm.match(/[A-Z]+(\d)/);
  if (numMatch) {
    const level = parseInt(numMatch[1], 10);
    if (level === 1) return 1;
    if (level === 2) return 3;
    if (level === 3) return 5;
    if (level === 4) return 7;
  }

  return null;
}

/**
 * Get placement info: the term and matching department
 */
export function getCoursePlacement(
  courseCode: string,
  preferredDept?: Department | string
): { semester: number; department: string } | null {
  const norm = normalizeCode(courseCode);
  if (!norm) return null;

  if (preferredDept && DEPARTMENT_COURSE_SEMESTERS[preferredDept]) {
    const sem = DEPARTMENT_COURSE_SEMESTERS[preferredDept][norm];
    if (typeof sem === "number") {
      return { semester: sem, department: preferredDept };
    }
  }

  for (const [dept, courses] of Object.entries(DEPARTMENT_COURSE_SEMESTERS)) {
    const sem = courses[norm];
    if (typeof sem === "number") {
      return { semester: sem, department: dept };
    }
  }

  const term = getCourseTerm(courseCode, preferredDept);
  if (term !== null) {
    return { semester: term, department: preferredDept || "CS" };
  }

  return null;
}
