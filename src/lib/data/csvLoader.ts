/**
 * CSV data loading utilities - CLIENT-SIDE ONLY
 */

import Papa from "papaparse";
import { Course, ElectiveCourse, Department } from "@/types";

export interface CSVRow {
  "Course Code": string;
  "Course Title": string;
  "Prerequisite Code": string;
  "Prerequisite Title"?: string;
}

/**
 * Parse CSV content into structured data
 */
export function parseCSV<T = any>(content: string): T[] {
  const result = Papa.parse<T>(content, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });

  if (result.errors.length > 0) {
    console.error("CSV parsing errors:", result.errors);
  }

  return result.data;
}

/**
 * Fetch CSV file from public directory (client-side)
 */
async function fetchCSV(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${path}: ${response.statusText}`);
  }
  return response.text();
}

/**
 * Load course plan CSV for a specific department
 */
export async function loadCoursePlan(
  department: Department
): Promise<Course[]> {
  const content = await fetchCSV(`/data/courses/${department} Courses.csv`);
  const rows = parseCSV<CSVRow>(content);

  return rows.map((row) => ({
    code: row["Course Code"]?.trim() || "",
    title: row["Course Title"]?.trim() || "",
    prerequisiteCode: row["Prerequisite Code"]?.trim() || "-",
    prerequisiteTitle: row["Prerequisite Title"]?.trim(),
  }));
}

/**
 * Load major electives CSV for a specific department
 */
export async function loadMajorElectives(
  department: Department
): Promise<ElectiveCourse[]> {
  const content = await fetchCSV(`/data/majors/Major ${department}.csv`);
  const rows = parseCSV<Omit<CSVRow, "Prerequisite Title">>(content);

  return rows.map((row) => ({
    code: row["Course Code"]?.trim() || "",
    title: row["Course Title"]?.trim() || "",
    prerequisiteCode: row["Prerequisite Code"]?.trim() || "-",
  }));
}

/**
 * Load science electives CSV
 */
export async function loadScienceElectives(): Promise<ElectiveCourse[]> {
  const content = await fetchCSV(`/data/electives/science.csv`);
  const rows = parseCSV<Omit<CSVRow, "Prerequisite Title">>(content);

  return rows.map((row) => ({
    code: row["Course Code"]?.trim() || "",
    title: row["Course Title"]?.trim() || "",
    prerequisiteCode: row["Prerequisite Code"]?.trim() || "-",
  }));
}

/**
 * Load university requirement electives CSV
 */
export async function loadUniversityElectives(): Promise<ElectiveCourse[]> {
  const content = await fetchCSV(`/data/electives/university.csv`);
  const rows = parseCSV<Omit<CSVRow, "Prerequisite Title">>(content);

  return rows.map((row) => ({
    code: row["Course Code"]?.trim() || "",
    title: row["Course Title"]?.trim() || "",
    prerequisiteCode: row["Prerequisite Code"]?.trim() || "-",
  }));
}

/**
 * Load all data for a department
 */
export async function loadDepartmentData(department: Department) {
  const [courses, majorElectives, scienceElectives, universityElectives] =
    await Promise.all([
      loadCoursePlan(department),
      loadMajorElectives(department),
      loadScienceElectives(),
      loadUniversityElectives(),
    ]);

  return {
    courses,
    majorElectives,
    scienceElectives,
    universityElectives,
  };
}
