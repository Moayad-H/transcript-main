/**
 * PDF Transcript Parser - CLIENT-SIDE
 * Parses Arab Academy transcript PDFs using layout-aware logic
 */

import { Semester, StudiedCourse, TranscriptData, Department } from "@/types";
import { GRADES, TWO_CREDIT_HOURS, CREDIT_HOURS_PER_COURSE, isTwoCreditCourse, canonicalizeCode, PRACTICAL_TRAINING_CODE, PROBATION_GPA_THRESHOLD, SPECIAL_COURSES } from "@/lib/constants";
import { compareSemesters, parseSemesterLabel } from "./semester";

/**
 * A text fragment with its position on the page. Transcripts print two
 * side-by-side semester tables per row, and pdf.js emits the fragments in an
 * order that interleaves the columns and puts each semester header *after* the
 * courses it covers — so linking a course to its semester needs coordinates,
 * not reading order.
 */
interface PositionedItem {
  str: string;
  x: number;
  y: number;
  page: number;
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

    // Extract text from all pages, keeping both the flat string (student info,
    // GPA) and the positioned fragments (course/semester layout).
    let fullText = "";
    const positionedItems: PositionedItem[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      // pdf.js mixes text items with marked-content markers; keep the text.
      const items = textContent.items.filter(
        (item): item is Extract<typeof item, { str: string }> =>
          "str" in item && item.str.length > 0
      );
      fullText += items.map((item) => item.str).join(" ") + " ";
      for (const item of items) {
        if (!item.str.trim()) continue;
        positionedItems.push({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
          page: pageNum,
        });
      }
    }

    // Extract student info
    const { name, id, department } = extractStudentInfoFromText(fullText);

    // Extract cumulative GPA as printed on the transcript
    const gpa = extractGpaFromText(fullText);

    // Best-effort count of terms the student was on probation (GPA < 2.0)
    const probationSemesters = extractProbationSemesters(fullText);

    // Extract courses from the page layout so each one carries the semester it
    // was taken in; fall back to the flat-text scan if the layout is unusable.
    const layoutCourses = extractCoursesFromLayout(positionedItems);
    const allCourses =
      layoutCourses.length > 0 ? layoutCourses : extractCoursesFromText(fullText);

    // Order attempts chronologically so "the latest attempt wins" rules (remedial
    // status, retake advice) see the real sequence rather than PDF reading order.
    const orderedCourses = sortCoursesChronologically(allCourses);

    // Remove failed and withdrawn courses, track remedial
    const { courses: validCourses, remedialCourses } =
      processRemedialCourses(orderedCourses);

    return {
      studentName: name,
      studentId: id,
      department,
      courses: validCourses,
      remedialCourses,
      gpa,
      probationSemesters,
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

  const dept = text.match(/:\s*(Preparation of Science[^\n]*|Cybersecurity(?:-\s*Cairo)?|Artificial Intelligence|Engineering Software C-S|Computer Science|Information Systems(?:\s+Cairo)?)/);

  // Extract department - look for "Engineering" variants
  let department: Department = "SE";
  // "Preparation of Science - Computer Science / Cairo" contains "Computer
  // Science", so it must be matched before the CS branch below.
  if (/Preparation\s+of\s+Science/i.test(dept!= null ? dept.toString() : "")) {
    department = "PSCS";
  } else if (/Engineering\s+Software|Software.*C-S/i.test(dept!= null ? dept.toString() : "")) {
    department = "SE";
  } else if (/Computer\s+Science|CS/i.test(dept!= null ? dept.toString() : "")) {
    department = "CS";
  } else if (/Information\s+Systems|IS/i.test(dept!= null ? dept.toString() : "")) {
    department = "IS";
  } 
    else if (/Cybersecurity- Cairo|CY/i.test(dept!= null ? dept.toString() : "")) {
    department = "CY";
  }
  else if (/Artificial\s+Intelligence|AI/i.test(dept!= null ? dept.toString() : "")) {
    department = "AI";
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
 * Best-effort count of semesters the student was on academic probation.
 *
 * Arab Academy transcripts print a cumulative "G.P.A" value for each term. A
 * term whose cumulative standing is below the probation threshold (2.0) counts
 * as a probation semester, so we count how many of the printed G.P.A values
 * fall below the threshold. This is a heuristic — the exact per-term semantics
 * vary by transcript layout — and degrades to 0 when nothing parses.
 */
function extractProbationSemesters(text: string): number {
  // const gpaPattern = /G\.?\s*P\.?\s*A\.?\s*:?\s*(\d+(?:\.\d+)?)/gi;
  // let match;
  // let count = 0;
  // while ((match = gpaPattern.exec(text)) !== null) {
  //   const value = parseFloat(match[1]);
  //   if (!Number.isNaN(value) && value < PROBATION_GPA_THRESHOLD) {
  //     count += 1;
  //   }
  // }
  // return count;
  return 0;
}

/** A course code as printed in the "COURSE NO." column, e.g. "CCS2401". */
const COURSE_CODE_PATTERN = /^[A-Z]{3}\d{4}$/;

/** Rows are printed on a shared baseline; allow for sub-point jitter. */
const ROW_Y_TOLERANCE = 2.5;

/**
 * A course line: code, title, credits attempted, then the grade. Shared by the
 * layout and flat-text scans so both agree on what a course row looks like.
 */
const COURSE_LINE_PATTERN =
  /([A-Z]{3}\d{4})\s+(.+?)\s+(\d+(?:\.\d+)?)\s+(A\s*\+|A\s*-|A|B\s*\+|B\s*-|B|C\s*\+|C\s*-|C|D\s*\+|D\s*-|D|F|P|U|W|I|Tr\.?)/;

/**
 * Turn one course line into a StudiedCourse, or null when the line is a table
 * header / summary row rather than a course.
 */
function parseCourseLine(line: string): StudiedCourse | null {
  const match = line.match(COURSE_LINE_PATTERN);
  if (!match) return null;

  const title = match[2].trim();
  // Skip semester names and table metadata that can look like a course line.
  if (
    /Semester|COURSE|TITLE|ATT\.|GR\.|PTS\.|ACH\.|GPA/i.test(title) ||
    title.length < 3
  ) {
    return null;
  }

  return {
    code: match[1],
    // Normalize the grade ("A +" -> "A+", "Tr." -> "Tr").
    title,
    grade: match[4].replace(/\s+/g, "").replace(/\.$/, ""),
  };
}

/**
 * Group positioned fragments into printed rows (same page, same baseline),
 * ordered top-to-bottom. PDF y grows upward, so rows sort by descending y.
 */
function groupIntoRows(items: PositionedItem[]): PositionedItem[][] {
  const sorted = [...items].sort(
    (a, b) => a.page - b.page || b.y - a.y || a.x - b.x
  );

  const rows: PositionedItem[][] = [];
  let current: PositionedItem[] = [];
  for (const item of sorted) {
    const reference = current[0];
    if (
      reference &&
      reference.page === item.page &&
      Math.abs(reference.y - item.y) <= ROW_Y_TOLERANCE
    ) {
      current.push(item);
    } else {
      if (current.length > 0) rows.push(current);
      current = [item];
    }
  }
  if (current.length > 0) rows.push(current);

  return rows.map((row) => [...row].sort((a, b) => a.x - b.x));
}

/** Minimum horizontal gap between the two tables' code columns. */
const MIN_COLUMN_GAP = 100;

/**
 * The x coordinate separating the transcript's two side-by-side semester
 * tables. Course codes start each table, so the right table begins exactly at
 * its code column — every field of the left table (title through GPA) is
 * printed before it. The split is therefore the start of the right code
 * column, found as the far side of the largest gap between code positions,
 * rather than a fixed page fraction: the tables are wide enough that the left
 * table's own columns run past the page midpoint.
 *
 * Returns Infinity for a single-column layout, putting every course in the
 * left column.
 */
function findColumnSplit(items: PositionedItem[]): number {
  const codeXs = items
    .filter((item) => COURSE_CODE_PATTERN.test(item.str.trim()))
    .map((item) => item.x)
    .sort((a, b) => a - b);
  if (codeXs.length === 0) return Infinity;

  let gapStart = -1;
  let widestGap = 0;
  for (let i = 1; i < codeXs.length; i++) {
    const gap = codeXs[i] - codeXs[i - 1];
    if (gap > widestGap) {
      widestGap = gap;
      gapStart = i;
    }
  }
  // A single table's codes all share one x (only sub-point jitter between them).
  if (widestGap < MIN_COLUMN_GAP) return Infinity;

  // Sit just left of the right code column so its own codes fall on the right.
  return codeXs[gapStart] - 0.5;
}

/**
 * Extract courses from the page layout, linking each to the semester header it
 * is printed under.
 *
 * Semester headers sit above their courses in the same column, so a course
 * belongs to the nearest header above it (largest y that is still below the
 * header's y) within its own column.
 */
function extractCoursesFromLayout(items: PositionedItem[]): StudiedCourse[] {
  if (items.length === 0) return [];

  const splitX = findColumnSplit(items);
  const columnOf = (x: number) => (x < splitX ? 0 : 1);
  const rows = groupIntoRows(items);

  const headers: {
    semester: Semester;
    page: number;
    column: number;
    y: number;
  }[] = [];
  const courses: {
    course: StudiedCourse;
    page: number;
    column: number;
    y: number;
  }[] = [];

  for (const row of rows) {
    // Split the row into its two table columns.
    const buckets = new Map<number, PositionedItem[]>();
    for (const item of row) {
      const column = columnOf(item.x);
      const bucket = buckets.get(column);
      if (bucket) bucket.push(item);
      else buckets.set(column, [item]);
    }

    for (const [column, bucket] of buckets) {
      // A semester header occupies its own row; match on the joined text so a
      // header broken into several fragments still resolves.
      const semester = parseSemesterLabel(bucket.map((i) => i.str).join(" "));
      if (semester) {
        headers.push({ semester, page: bucket[0].page, column, y: bucket[0].y });
        continue;
      }

      // Otherwise each course code starts a course that runs to the next code.
      const codeIndices = bucket
        .map((item, index) =>
          COURSE_CODE_PATTERN.test(item.str.trim()) ? index : -1
        )
        .filter((index) => index >= 0);

      for (let i = 0; i < codeIndices.length; i++) {
        const start = codeIndices[i];
        const end = codeIndices[i + 1] ?? bucket.length;
        const slice = bucket.slice(start, end);
        const course = parseCourseLine(slice.map((item) => item.str).join(" "));
        if (course) {
          courses.push({
            course,
            page: slice[0].page,
            column,
            y: slice[0].y,
          });
        }
      }
    }
  }

  return courses.map(({ course, page, column, y }) => {
    const semester =
      findSemesterAbove(headers, page, y, column) ??
      findSemesterAbove(headers, page, y, null);
    return semester ? { ...course, semester } : course;
  });
}

/**
 * Nearest semester header printed above a course on the same page — restricted
 * to one column, or any column when `column` is null (fallback for a table
 * whose own column header is missing).
 */
function findSemesterAbove(
  headers: { semester: Semester; page: number; column: number; y: number }[],
  page: number,
  y: number,
  column: number | null
): Semester | undefined {
  let best: { semester: Semester; distance: number } | undefined;
  for (const header of headers) {
    if (header.page !== page) continue;
    if (column !== null && header.column !== column) continue;
    const distance = header.y - y;
    if (distance <= 0) continue;
    if (!best || distance < best.distance) {
      best = { semester: header.semester, distance };
    }
  }
  return best?.semester;
}

/**
 * Extract courses from full text (fallback when the page layout yields nothing)
 * Course format: COURSE_CODE COURSE_TITLE CREDITS_ATTEMPTED GRADE GRADE_POINTS CREDITS_ACHIEVED
 */
function extractCoursesFromText(text: string): StudiedCourse[] {
  const courses: StudiedCourse[] = [];

  // Same course-line shape as the layout scan, applied repeatedly across the
  // flattened page text. Courses parsed this way carry no semester.
  const coursePattern = new RegExp(COURSE_LINE_PATTERN.source, "g");

  let match;
  while ((match = coursePattern.exec(text)) !== null) {
    const course = parseCourseLine(match[0]);
    if (course) courses.push(course);
  }

  return courses;
}

/**
 * Sort courses by the semester they were taken in, earliest first. Courses with
 * no semester keep their original relative order at the end of the list.
 */
function sortCoursesChronologically(courses: StudiedCourse[]): StudiedCourse[] {
  return [...courses]
    .map((course, index) => ({ course, index }))
    .sort((a, b) => {
      const aSemester = a.course.semester;
      const bSemester = b.course.semester;
      if (aSemester && bSemester) {
        return compareSemesters(aSemester, bSemester) || a.index - b.index;
      }
      if (aSemester) return -1;
      if (bSemester) return 1;
      return a.index - b.index;
    })
    .map(({ course }) => course);
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
  const canonical = canonicalizeCode(course.code);
  // Ignore Remedial English and Precalculus for credit hours (0 Cr)
  if (canonical === canonicalizeCode(SPECIAL_COURSES.REMEDIAL_ENGLISH) || canonical === canonicalizeCode(SPECIAL_COURSES.PRECALCULUS)) {
    return 0;
  }
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
    const courseCreditValue = getCourseCreditValue(course);
    totalCredits += courseCreditValue;
  }

  // Handle professional training (they were counted as 3 in the loop above if they don't start with UNR/CNC)
  // Usually professional training starts with CCS (e.g. CCS4001, CCS4002), so they would be 3 credits.
  // The current logic subtracts (professionalTrainingCount * 3) from total.

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
