/**
 * Client-side PDF parsing using browser APIs
 * This version works without Node.js dependencies
 */

import { StudiedCourse, TranscriptData } from "@/types";
import { GRADES } from "@/lib/constants";

/**
 * Parse PDF transcript on the client side
 * For now, returns mock data - real implementation would use pdf.js
 */
export async function parseTranscriptPDF(file: File): Promise<TranscriptData> {
  // TODO: Implement client-side PDF parsing with pdf.js
  // For now, return structure that matches expected format

  // This is a placeholder - in production, you would:
  // 1. Use pdf.js to extract text from PDF
  // 2. Parse the text to extract course information
  // 3. Filter and process courses

  throw new Error(
    "PDF parsing requires manual course entry for now. Please implement pdf.js integration or use the API version."
  );
}

/**
 * Manual course entry alternative
 */
export function createTranscriptFromManualEntry(
  courses: StudiedCourse[]
): TranscriptData {
  const remedialCourses: string[] = [];
  const validCourses: StudiedCourse[] = [];

  for (const course of courses) {
    const isFailed = course.grade === "F";
    const isWithdrawn = course.grade === "W";

    // Track remedial courses
    if (
      course.title.toLowerCase().includes("precalculus") &&
      (isFailed || isWithdrawn)
    ) {
      remedialCourses.push("Precalculus");
    }
    if (
      course.title.toLowerCase().includes("remedial english") &&
      (isFailed || isWithdrawn)
    ) {
      remedialCourses.push("Remedial English");
    }

    // Include all courses, filtering happens later
    validCourses.push(course);
  }

  return {
    studentName: "",
    studentId: "",
    department: "SE" as const,
    courses: validCourses,
    remedialCourses: Array.from(new Set(remedialCourses)),
  };
}

/**
 * Get list of studied course codes (passed or ungraded)
 */
export function getStudiedCourseCodes(courses: StudiedCourse[]): string[] {
  const completedGrades = new Set([...GRADES.PASSING, ...GRADES.UNGRADED] as string[]);
  
  return courses
    .filter(course => completedGrades.has(course.grade))
    .map((course) => course.code.replace(/\s/g, ""));
}

/**
 * Get withdrawn or failed courses
 */
export function getWithdrawnFailedCourses(courses: StudiedCourse[]): StudiedCourse[] {
  const failedOrWithdrawnGrades = new Set([...GRADES.FAILING, ...GRADES.WITHDRAWN] as string[]);
  
  return courses.filter(course => failedOrWithdrawnGrades.has(course.grade));
}

/**
 * Get ungraded courses
 */
export function getUngradedCourses(courses: StudiedCourse[]): StudiedCourse[] {
  return courses.filter((course) => course.grade === "U");
}

/**
 * Calculate total credit hours
 * Standard courses: 3 credit hours
 * UNR and CNC courses: 2 credit hours
 * Professional training: 0 credit hours
 */
export function calculateCreditHours(
  courses: StudiedCourse[],
  professionalTrainingCount: number = 0
): number {
  const validGrades = [...GRADES.PASSING];
  const completedCourses = courses.filter((course) =>
    validGrades.includes(course.grade as any)
  );
  
  let totalCredits = 0;
  for (const course of completedCourses) {
    const isTwoCredit = course.code.startsWith("UNR") || course.code.startsWith("CNC");
    totalCredits += isTwoCredit ? 2 : 3;
  }

  return totalCredits - professionalTrainingCount * 3;
}
