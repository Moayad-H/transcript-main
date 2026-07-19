/**
 * PDF Transcript Parser - CLIENT-SIDE
 * Parses Arab Academy transcript PDFs using layout-aware logic
 */

import { StudiedCourse, TranscriptData, Department } from "@/types";
import { GRADES, TWO_CREDIT_HOURS, CREDIT_HOURS_PER_COURSE, isTwoCreditCourse, canonicalizeCode, PRACTICAL_TRAINING_CODE } from "@/lib/constants";

interface PDFTextItem {
  str: string;
  transform: number[];
}

interface PDFTextContent {
  items: (PDFTextItem | { type: string })[];
}

/**
 * Parse PDF transcript and extract course data
 * Uses semester sections as anchors and robust regex parsing
 */
export async function parseTranscriptPDF(
  buffer: Buffer
): Promise<TranscriptData> {
  try {
    // Dynamically import pdfjs only on client side
    const pdfjsLib = await import("pdfjs-dist");

    // Configure worker - use local file from public directory
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    // Convert Buffer to Uint8Array for pdfjs
    const uint8Array = new Uint8Array(buffer);

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;

    // Extract text from all pages into single string
    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .filter((item: any) => item.str)
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + " ";
    }

    // Extract student info
    const { name, id, department } = extractStudentInfoFromText(fullText);

    // Extract cumulative GPA as printed on the transcript
    const gpa = extractGpaFromText(fullText);

    // Extract courses using semester-based parsing
    const allCourses = extractCoursesFromText(fullText);

    // Remove failed and withdrawn courses, track remedial
    const { courses: validCourses, remedialCourses } =
      processRemedialCourses(allCourses);

    return {
      studentName: name,
      studentId: id,
      department,
      courses: validCourses,
      remedialCourses,
      gpa,
    };
  } catch (error) {
    console.error("PDF parsing error:", error);
    throw new Error("Failed to parse PDF transcript");
  }
}

/**
 * Extract student information from full text
 * Extract ONLY clean ASCII fields
 */
function extractStudentInfoFromText(text: string): {
  name: string;
  id: string;
  department: Department;
} {
  // Extract Reg. No. - reliable numeric pattern
  let studentId = "";
  const idMatch = text.match(/Reg\.\s*No\.\s*:\s*(\d{9})/);
  if (idMatch) {
    studentId = idMatch[1];
  }

  // Extract name - appears after ":" following reg number
  let studentName = "";
  const nameMatch = text.match(
    /Reg\.\s*No\.\s*:\s*\d+\s+\d+\s*:\s*([A-Za-z\s]+?)(?:\s+[^\w\s]|$)/
  );
  if (nameMatch) {
    studentName = nameMatch[1].trim();
  }

  // Extract department - look for "Engineering" variants
  let department: Department = "SE";
  if (/Engineering\s+Software|Software.*C-S/i.test(text)) {
    department = "SE";
  } else if (/Computer\s+Science|CS/i.test(text)) {
    department = "CS";
  } else if (/Information\s+Systems|IS/i.test(text)) {
    department = "IS";
  } else if (/Artificial\s+Intelligence|AI/i.test(text)) {
    department = "AI";
  } else if (/Cybersecurity|CY/i.test(text)) {
    department = "CY";
  }

  return { name: studentName, id: studentId, department };
}

/**
 * Extract the cumulative G.P.A as printed on the transcript.
 * Written as "G.P.A: (number)". When several G.P.A values appear (per-semester
 * plus cumulative), the last one is the cumulative figure.
 */
function extractGpaFromText(text: string): number | null {
  const gpaPattern = /G\.?\s*P\.?\s*A\.?\s*:?\s*(\d+(?:\.\d+)?)/gi;
  let match;
  let lastValue: number | null = null;
  while ((match = gpaPattern.exec(text)) !== null) {
    const value = parseFloat(match[1]);
    if (!Number.isNaN(value)) {
      lastValue = value;
    }
  }
  return lastValue;
}

/**
 * Extract courses from full text using semester-based parsing
 * Course format: COURSE_CODE COURSE_TITLE CREDITS_ATTEMPTED GRADE GRADE_POINTS CREDITS_ACHIEVED
 */
function extractCoursesFromText(text: string): StudiedCourse[] {
  const courses: StudiedCourse[] = [];

  // DEBUG: Find CCS2304 in text to check formatting
  const debugCode = "CCS2304";
  const index = text.indexOf(debugCode);
  if (index !== -1) {
    console.log(
      `Context around ${debugCode}:`,
      text.substring(index, index + 100)
    );
  } else {
    console.log(`${debugCode} NOT FOUND IN TEXT`);
  }

  // Course code pattern: [A-Z]{3}[0-9]{4}
  // Valid grades: A+, A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F, P, U, W, I
  // Updated to allow spaces in grades (e.g. A +) and more characters in title (numbers, parens, etc.)
  // Also updated to handle cases where credits might be missing or formatted differently
  // Using .+? for title to be more permissive
  // Added Tr (Transfer) to valid grades
  const coursePattern =
    /([A-Z]{3}\d{4})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(A\s*\+|A\s*-|A|B\s*\+|B\s*-|B|C\s*\+|C\s*-|C|D\s*\+|D\s*-|D|F|P|U|W|I|Tr\.?)/g;

  let match;
  while ((match = coursePattern.exec(text)) !== null) {
    const code = match[1];
    const title = match[2].trim();
    // Normalize grade (remove spaces, e.g. "A +" -> "A+", and remove trailing dot e.g. "Tr." -> "Tr")
    const grade = match[4].replace(/\s+/g, "").replace(/\.$/, "");

    // DEBUG: Log found course
    // console.log(`Found course: ${code} - ${title} - ${grade}`);

    // Skip if title looks like a semester name or metadata
    if (
      /Semester|COURSE|TITLE|ATT\.|GR\.|PTS\.|ACH\.|GPA/i.test(title) ||
      title.length < 3
    ) {
      continue;
    }

    courses.push({
      code,
      title,
      grade,
    });
  }

  return courses;
}

/**
 * Process courses to identify remedial status
 * Keeps all courses including failed/withdrawn
 */
function processRemedialCourses(courses: StudiedCourse[]): {
  courses: StudiedCourse[];
  remedialCourses: string[];
} {
  const remedialCourses: string[] = [];
  const validCourses: StudiedCourse[] = [];

  let precalculusAttempted = false;
  let remedialEnglishAttempted = false;
  let precalculusFailed = false;
  let remedialEnglishFailed = false;

  for (const course of courses) {
    const isFailed = course.grade === "F";
    const isWithdrawn = course.grade === "W";
    const isPassed = course.grade === "P";

    // Track Precalculus attempts
    if (course.title.toLowerCase().includes("precalculus")) {
      precalculusAttempted = true;
      if (isFailed || isWithdrawn) {
        precalculusFailed = true;
      } else if (isPassed) {
        precalculusFailed = false; // Passed, no longer needs remedial
      }
    }

    // Track Remedial English attempts
    if (course.title.toLowerCase().includes("remedial english")) {
      remedialEnglishAttempted = true;
      if (isFailed || isWithdrawn) {
        remedialEnglishFailed = true;
      } else if (isPassed) {
        remedialEnglishFailed = false; // Passed, no longer needs remedial
      }
    }

    // Include all courses
    validCourses.push(course);
  }

  // Only add to remedialCourses if student attempted AND still failed
  if (precalculusAttempted && precalculusFailed) {
    remedialCourses.push("Precalculus");
  }
  if (remedialEnglishAttempted && remedialEnglishFailed) {
    remedialCourses.push("Remedial English");
  }

  return {
    courses: validCourses,
    remedialCourses,
  };
}

/**
 * Get list of studied course codes (passed or ungraded only)
 * Ports Python's get_studied_course_codes function
 */
export function getStudiedCourseCodes(courses: StudiedCourse[]): string[] {
  const completedGrades = new Set([...GRADES.PASSING, ...GRADES.UNGRADED] as string[]);
  
  // Normalize codes (alphanumeric only, uppercased) and resolve cross-department
  // equivalences so a course taken under either code counts as the same course.
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
 * Get ungraded courses (Grade = 'U')
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
  if(course.code == "GLA0001" || course.code == "EBA0201" ) {return 0;} // Ignore Remedial English and Precalculus for credit hours
  return isTwoCreditCourse(course.code) ? TWO_CREDIT_HOURS : CREDIT_HOURS_PER_COURSE;
}

/**
 * Calculate total credit hours from completed courses
 * Standard courses: 3 credit hours
 * UNR and CNC courses in Semester 1 & 2: 2 credit hours
 * Professional training: 0 credit hours
 */
export function calculateCreditHours(
  courses: StudiedCourse[],
  professionalTrainingCount: number = 0
): number {
  const validGrades = [...GRADES.PASSING] as string[];
  const completedCourses = courses.filter((course) =>
    validGrades.includes(course.grade)
  );
  

  // Count each course once, even if it appears under equivalent codes
  // (e.g. CCS3601 and CAI3101 are the same course).
  const seen = new Set<string>();
  let totalCredits = 0;
  for (const course of completedCourses) {
    const canonical = canonicalizeCode(course.code);
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    var courseCreditValue = getCourseCreditValue(course);
    console.log(`Adding ${course.code} (${course.title}) - ${courseCreditValue} credits`);
    totalCredits += courseCreditValue;
  }

  // Handle professional training (they were counted as 3 in the loop above if they don't start with UNR/CNC)
  // Usually professional training starts with CCS (e.g. CCS4001, CCS4002), so they would be 3 credits.
  // The current logic subtracts (professionalTrainingCount * 3) from total.
  console.log(`Total credits before professional training adjustment: ${totalCredits} - Professional training count: ${professionalTrainingCount} - Adjusted total: ${totalCredits - professionalTrainingCount * 3}`);

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
