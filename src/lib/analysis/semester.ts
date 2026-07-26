/**
 * Academic semester model
 *
 * Transcripts group courses under semester headers written as
 * "{First|Second|Summer} Semester / {startYear}-{endYear}", e.g.
 * "First Semester / 2024-2025". This module turns those labels into a
 * comparable value and derives the retake advice that depends on them: a course
 * passed with a weak grade (D+ and under) is worth repeating only while it is
 * still inside the retake window.
 */

import {
  RetakeRecommendation,
  Semester,
  SemesterTerm,
  StudiedCourse,
} from "@/types";
import {
  canonicalizeCode,
  GRADES,
  RETAKE_GRADES,
  RETAKE_WINDOW_TERMS,
  TERMS_PER_ACADEMIC_YEAR,
} from "@/lib/constants";

/** Chronological order of the three terms inside one academic year. */
const TERM_ORDER: Record<SemesterTerm, number> = {
  First: 0,
  Second: 1,
  Summer: 2,
};

/**
 * Matches a transcript semester header. Tolerates the spacing variations pdf.js
 * produces ("First Semester /2024-2025", double spaces, an en dash between the
 * years).
 */
const SEMESTER_LABEL_PATTERN =
  /\b(First|Second|Summer)\s+Semester\s*\/\s*(\d{4})\s*[-–—]\s*(\d{4})\b/i;

/**
 * Whether a text fragment is a semester header.
 */
export function isSemesterLabel(text: string): boolean {
  return SEMESTER_LABEL_PATTERN.test(text);
}

/**
 * Parse a semester header into a structured value; null when the text isn't a
 * semester header.
 */
export function parseSemesterLabel(text: string): Semester | null {
  const match = text.match(SEMESTER_LABEL_PATTERN);
  if (!match) return null;

  const term = (match[1][0].toUpperCase() +
    match[1].slice(1).toLowerCase()) as SemesterTerm;
  const startYear = parseInt(match[2], 10);
  const endYear = parseInt(match[3], 10);

  return {
    term,
    startYear,
    endYear,
    label: formatSemester({ term, startYear, endYear, label: "" }),
  };
}

/**
 * Canonical display label, e.g. "First Semester / 2024-2025".
 */
export function formatSemester(semester: Semester): string {
  return `${semester.term} Semester / ${semester.startYear}-${semester.endYear}`;
}

/**
 * Position of a semester on a single chronological axis, counted in terms since
 * year 0. Differences between two indices are a count of terms, so one academic
 * year apart is exactly TERMS_PER_ACADEMIC_YEAR.
 */
export function semesterIndex(semester: Semester): number {
  return semester.startYear * TERMS_PER_ACADEMIC_YEAR + TERM_ORDER[semester.term];
}

/**
 * Sort comparator: earlier semesters first.
 */
export function compareSemesters(a: Semester, b: Semester): number {
  return semesterIndex(a) - semesterIndex(b);
}

/**
 * The most recent semester appearing on the transcript — the anchor the retake
 * window is measured back from. Null when no course carries a semester.
 */
export function getLatestSemester(courses: StudiedCourse[]): Semester | null {
  let latest: Semester | null = null;
  for (const course of courses) {
    if (!course.semester) continue;
    if (latest === null || compareSemesters(course.semester, latest) > 0) {
      latest = course.semester;
    }
  }
  return latest;
}

/**
 * Whether `semester` falls inside the retake window ending at `anchor` — i.e.
 * at most RETAKE_WINDOW_TERMS terms before it. Semesters after the anchor
 * (shouldn't happen, but transcripts vary) count as inside.
 */
export function isWithinRetakeWindow(
  semester: Semester,
  anchor: Semester,
  windowTerms: number = RETAKE_WINDOW_TERMS
): boolean {
  return semesterIndex(anchor) - semesterIndex(semester) <= windowTerms;
}

/** How many terms back from the anchor a semester sits (0 = the anchor itself). */
export function termsSince(semester: Semester, anchor: Semester): number {
  return semesterIndex(anchor) - semesterIndex(semester);
}

/**
 * The attempt that determines a course's standing: a passing attempt always
 * beats an F/W, and among comparable attempts the latest semester wins. Mirrors
 * the "best attempt" rule the course graph uses for grade display.
 */
function pickStandingAttempt(attempts: StudiedCourse[]): StudiedCourse {
  const passing = new Set<string>([...GRADES.PASSING]);
  return attempts.reduce((best, current) => {
    const bestPasses = passing.has(best.grade);
    const currentPasses = passing.has(current.grade);
    if (bestPasses !== currentPasses) return currentPasses ? current : best;

    // Same standing: prefer the one with the later semester. An attempt with no
    // semester loses to one that has a semester, and ties keep the first seen.
    if (!current.semester) return best;
    if (!best.semester) return current;
    return compareSemesters(current.semester, best.semester) > 0 ? current : best;
  });
}

/**
 * Courses the student should be advised to repeat: passed with a weak grade
 * (RETAKE_GRADES — "D+ and under") within the last RETAKE_WINDOW_TERMS terms of
 * the transcript's latest semester.
 *
 * The window is anchored on the latest semester the transcript itself shows,
 * not the real-world date, so the advice is reproducible from the document
 * alone. Courses already retaken (a later, better attempt) or currently being
 * retaken (a "U" attempt) are excluded, as are courses with no semester
 * information — an unknown date can't be shown to be inside the window.
 *
 * Results are ordered most recent first.
 */
export function getRetakeRecommendations(
  courses: StudiedCourse[],
  windowTerms: number = RETAKE_WINDOW_TERMS
): RetakeRecommendation[] {
  const anchor = getLatestSemester(courses);
  if (!anchor) return [];

  // Group every attempt of the same course, resolving code aliases.
  const attemptsByCode = new Map<string, StudiedCourse[]>();
  for (const course of courses) {
    const key = canonicalizeCode(course.code);
    const existing = attemptsByCode.get(key);
    if (existing) existing.push(course);
    else attemptsByCode.set(key, [course]);
  }

  const recommendations: RetakeRecommendation[] = [];
  for (const attempts of attemptsByCode.values()) {
    // A retake already in progress needs no advice.
    const ungraded = new Set<string>([...GRADES.UNGRADED]);
    if (attempts.some((attempt) => ungraded.has(attempt.grade))) continue;

    const standing = pickStandingAttempt(attempts);
    if (!RETAKE_GRADES.includes(standing.grade)) continue;
    if (!standing.semester) continue;
    if (!isWithinRetakeWindow(standing.semester, anchor, windowTerms)) continue;

    recommendations.push({
      code: standing.code,
      title: standing.title,
      grade: standing.grade,
      semester: standing.semester,
      termsAgo: termsSince(standing.semester, anchor),
    });
  }

  return recommendations.sort(
    (a, b) =>
      a.termsAgo - b.termsAgo || a.code.localeCompare(b.code)
  );
}
