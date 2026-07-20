/**
 * Client-side PDF parsing using browser APIs
 * This version works without Node.js dependencies
 */

import { StudiedCourse, TranscriptData } from "@/types";
import { GRADES, TWO_CREDIT_HOURS, CREDIT_HOURS_PER_COURSE, isTwoCreditCourse, canonicalizeCode, PRACTICAL_TRAINING_CODE, SPECIAL_COURSES } from "@/lib/constants";

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
    .map((course) => canonicalizeCode(course.code));
}

/**
 * Get withdrawn or failed courses.
 * A course that was later retaken and passed (or is currently in progress) is
 * considered completed and excluded from this list.
 */
export function getWithdrawnFailedCourses(courses: StudiedCourse[]): StudiedCourse[] {
  const failedOrWithdrawnGrades = new Set([...GRADES.FAILING, ...GRADES.WITHDRAWN] as string[]);

  // Codes of courses that have a passing/ungraded attempt (i.e. completed on retake)
  const completedCodes = new Set(getStudiedCourseCodes(courses));

  return courses.filter(
    (course) =>
      failedOrWithdrawnGrades.has(course.grade) &&
      !completedCodes.has(canonicalizeCode(course.code))
  );
}

/**
 * Get ungraded courses
 */
export function getUngradedCourses(courses: StudiedCourse[]): StudiedCourse[] {
  return courses.filter((course) => course.grade === "U");
}

/**
 * Credit value for a single course
 * Standard courses: 3 credit hours
 * University Requirements (UNR*) and Entrepreneurship Skills (CNC1401): 2 credit hours
 */
function getCourseCreditValue(course: StudiedCourse): number {
  const canonical = canonicalizeCode(course.code);
  // Ignore Remedial English and Precalculus for credit hours (0 Cr)
  if (canonical === canonicalizeCode(SPECIAL_COURSES.REMEDIAL_ENGLISH) || canonical === canonicalizeCode(SPECIAL_COURSES.PRECALCULUS)) {
    return 0;
  }
  return isTwoCreditCourse(course.code) ? TWO_CREDIT_HOURS : CREDIT_HOURS_PER_COURSE;
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

  // Count each course once, even if it appears under equivalent codes
  // (e.g. CCS3601 and CAI3101 are the same course).
  const seen = new Set<string>();
  let totalCredits = 0;
  for (const course of completedCourses) {
    const canonical = canonicalizeCode(course.code);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    totalCredits += getCourseCreditValue(course);
  }

  // Practical Training (CIT4000) is pass/fail, like Professional Training, and
  // doesn't count toward credit hours even though it was added to the loop above.
  const practicalTraining = completedCourses.find(
    (course) => canonicalizeCode(course.code) === canonicalizeCode(PRACTICAL_TRAINING_CODE)
  );
  const practicalTrainingCredits = practicalTraining
    ? getCourseCreditValue(practicalTraining)
    : 0;

  return totalCredits - professionalTrainingCount * 3 - practicalTrainingCredits;
}

/**
 * Calculate credit hours pending from courses graded "U" (ungraded/in progress)
 */
export function calculateUngradedCreditHours(courses: StudiedCourse[]): number {
  // Count each course once, even under equivalent codes.
  const seen = new Set<string>();
  return getUngradedCourses(courses).reduce((total, course) => {
    const canonical = canonicalizeCode(course.code);
    if (seen.has(canonical)) return total;
    seen.add(canonical);
    return total + getCourseCreditValue(course);
  }, 0);
}
