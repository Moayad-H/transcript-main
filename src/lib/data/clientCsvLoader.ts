/**
 * Client-side CSV loading
 * Loads CSV files from public folder using fetch
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
 * Load course plan CSV for a specific department
 */
export async function loadCoursePlan(
  department: Department
): Promise<Course[]> {
  const response = await fetch(`/data/courses/${department} Courses.csv`);
  const text = await response.text();

  const result = Papa.parse<CSVRow>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data.map((row) => ({
    code: row["Course Code"]?.trim() || "",
    title: row["Course Title"]?.trim() || "",
    prerequisiteCode: row["Prerequisite Code"]?.trim() || "-",
    prerequisiteTitle: row["Prerequisite Title"]?.trim(),
  }));
}

/**
 * Load major electives CSV
 */
export async function loadMajorElectives(
  department: Department
): Promise<ElectiveCourse[]> {
  const response = await fetch(`/data/majors/Major ${department}.csv`);
  const text = await response.text();

  const result = Papa.parse<Omit<CSVRow, "Prerequisite Title">>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data.map((row) => ({
    code: row["Course Code"]?.trim() || "",
    title: row["Course Title"]?.trim() || "",
    prerequisiteCode: row["Prerequisite Code"]?.trim() || "-",
  }));
}

/**
 * Load science electives CSV
 */
export async function loadScienceElectives(): Promise<ElectiveCourse[]> {
  const response = await fetch("/data/electives/science.csv");
  const text = await response.text();

  const result = Papa.parse<Omit<CSVRow, "Prerequisite Title">>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data.map((row) => ({
    code: row["Course Code"]?.trim() || "",
    title: row["Course Title"]?.trim() || "",
    prerequisiteCode: row["Prerequisite Code"]?.trim() || "-",
  }));
}

/**
 * Load university requirement electives CSV
 */
export async function loadUniversityElectives(): Promise<ElectiveCourse[]> {
  const response = await fetch("/data/electives/university.csv");
  const text = await response.text();

  const result = Papa.parse<Omit<CSVRow, "Prerequisite Title">>(text, {
    header: true,
    skipEmptyLines: true,
  });

  return result.data.map((row) => ({
    code: row["Course Code"]?.trim() || "",
    title: row["Course Title"]?.trim() || "",
    prerequisiteCode: row["Prerequisite Code"]?.trim() || "-",
  }));
}

/**
 * Load all data for a department (client-side)
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
