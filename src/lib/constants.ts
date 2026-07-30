/**
 * Application constants
 */

import { Department } from "@/types";

export const DEPARTMENTS: Department[] = ["CS", "SE", "IS", "CY", "AI", "GM", "PSCS"];

export const DEPARTMENT_NAMES: Record<Department, string> = {
  CS: "Computer Science",
  SE: "Software Engineering",
  IS: "Information Systems",
  CY: "Cybersecurity",
  AI: "Artificial Intelligence",
  GM: "Multimedia",
  PSCS: "Preparation of Science - Computer Science / Cairo",
};

export const GRADES = {
  PASSING: [
    "A+",
    "A",
    "A-",
    "B+",
    "B",
    "B-",
    "C+",
    "C",
    "C-",
    "D+",
    "D",
    "D-",
    "P",
    "Tr", //handle transferred courses
  ],
  FAILING: ["F"],
  WITHDRAWN: ["W"],
  UNGRADED: ["U"],
} as const;

export const SPECIAL_COURSES = {
  PRECALCULUS: "EBA0201",
  REMEDIAL_ENGLISH: "GLA0001",
  ACADEMIC_ENGLISH: "UNR1403",
  CALCULUS_I: "EBA1203",
} as const;

// Practical Training: pass/fail core course, registerable once the student
// has reached 90 credit hours (gated the same way as other "N CR" prereqs).
// Like Professional Training, it doesn't count toward total credit hours.
export const PRACTICAL_TRAINING_CODE = "CIT4000";
export const PRACTICAL_TRAINING_MIN_CREDIT_HOURS = 90;
export const GRADUATION_CREDIT_HOURS = 132;

// A student must complete exactly this many Professional Training courses. The
// course-plan CSVs list many Professional Training options (a menu to choose
// from), but only PROFESSIONAL_TRAINING_REQUIRED of them count toward the
// requirement, so the counted requirement is capped at this value.
export const PROFESSIONAL_TRAINING_REQUIRED = 4;

// Academic probation ("half-load"): a student whose cumulative GPA falls below
// PROBATION_GPA_THRESHOLD is placed on probation. While on probation they may
// register at most PROBATION_HALF_LOAD_CREDITS credit hours, cannot register
// Project I, and cannot graduate. Probation may last at most
// PROBATION_MAX_SEMESTERS semesters before dismissal.
// Retake advice: a course passed with a weak grade may be repeated to raise the
// GPA, but only within a limited window after it was taken. RETAKE_GRADES are
// the passing grades weak enough to warrant the advice ("D+ and under");
// RETAKE_WINDOW_TERMS is that window measured in academic terms — one academic
// year is 3 terms (First, Second, Summer), so the same term one year earlier is
// still inside the window.
export const RETAKE_GRADES: readonly string[] = ["D+", "D", "D-"];
export const TERMS_PER_ACADEMIC_YEAR = 3;
export const RETAKE_WINDOW_TERMS = TERMS_PER_ACADEMIC_YEAR;

export const PROBATION_GPA_THRESHOLD = 2.0;
export const PROBATION_HALF_LOAD_CREDITS = 12;
export const PROBATION_MAX_SEMESTERS = 3;

// Normal per-semester registration load, used to size the "Recommended This
// Semester" list. Lower-year students (years 1–2) carry a heavier load than
// upper-year students (years 3–4), who typically fold in training/projects.
// Year is inferred from earned credit hours: year-3 advising starts around 69
// earned Cr (advising range 69–75, ±3 around 72). Probation overrides both with
// PROBATION_HALF_LOAD_CREDITS regardless of year.
export const NORMAL_LOAD_LOWER_YEARS = 18; // years 1–2 (< YEAR_UPPER_CREDIT_THRESHOLD)
export const NORMAL_LOAD_UPPER_YEARS = 15; // years 3–4
export const YEAR_UPPER_CREDIT_THRESHOLD = 69;

// Major electives are Semester 7–8 (year-4) courses in every department plan, so
// they're only advised once the student has reached year 4. Approximated by
// earned credit hours: three of eight semesters' worth of a 132 Cr. plan
// (132 * 6/8 = 99) puts the student entering Semester 7.
export const YEAR_FOUR_CREDIT_THRESHOLD = 99;

// Every year-4 semester (7 and 8) in every department plan is 3 core courses +
// 2 major electives. The major electives are advised separately (section B of
// "Courses You Can Register"), so the "Recommended This Semester" list for a
// year-4 student is capped at this many core courses rather than by credit load.
export const YEAR_FOUR_CORE_COURSES_PER_SEMESTER = 3;

// Professional Training is a fixed four-course sequence, taken one per semester
// starting in Semester 5 (year 3), identical across every department plan:
//   Sem 5: CIT3200  Professional Training in Mobile Apps Programming
//   Sem 6: Professional Training I  (track-specific — student's choice)
//   Sem 7: Professional Training II
//   Sem 8: Professional Training III
// Only the first slot has a fixed code; the rest depend on the track the student
// picks (Networking, Cybersecurity, …), so they're advised by their plan label.
// The order matches the department study plans and the course graph view, and is
// what section D of "Courses You Can Register" recommends the next slot from.
export const PROFESSIONAL_TRAINING_SEQUENCE: readonly {
  code: string;
  title: string;
}[] = [
  { code: "CIT3200", title: "Professional Training in Mobile Apps Programming" },
  { code: "", title: "Professional Training I" },
  { code: "", title: "Professional Training II" },
  { code: "", title: "Professional Training III" },
];

/**
 * Whether a course title is "Project I" (the pre-graduation project gated on a
 * ≥ 2.0 GPA). Project I appears under different codes per department
 * (CCS4901 / CSE4901 / CIS4901 / CCY4901 / CGM4901), so it's matched by title.
 * "Project II" must NOT match.
 */
export function isProjectOneTitle(title: string): boolean {
  return /\bproject\s+i\b/i.test(title.trim());
}

export const COURSE_PREFIXES = {
  COMPUTER_SCIENCE: "CCS",
  ENGINEERING: "EBA",
  UNIVERSITY: "UNR",
  INFORMATION_SYSTEMS: "CIS",
  AI: "CAI",
  CYBERSECURITY: "CCY",
  ENTREPRENEURSHIP: "CNC",
  IT: "CIT",
} as const;

export const ELECTIVE_KEYWORDS = {
  PROFESSIONAL: "Prof",
  MAJOR: "Major",
  SCIENCE: "Science El",
  UNIVERSITY: "University",
} as const;

// Course code equivalences: the same course appears under different codes across
// department plans. Each alias maps to a single canonical code so a course taken
// under one code counts everywhere the other code is referenced (completion,
// prerequisites, out-of-plan detection, graph status).
//
// CCS3601 (CS/IS/GM plans) and CAI3101 (AI/SE/CY plans) are both
// "Introduction to Artificial Intelligence".
const COURSE_CODE_EQUIVALENCE: Record<string, string> = {
  CCS3601: "CAI3101",
};

/**
 * Normalize a raw course code for comparison: strip non-alphanumeric characters,
 * uppercase, then resolve known cross-department equivalences to a canonical code.
 * Use this anywhere two course codes are compared.
 */
export function canonicalizeCode(code: string): string {
  const normalized = code.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return COURSE_CODE_EQUIVALENCE[normalized] ?? normalized;
}

export const CREDIT_HOURS_PER_COURSE = 3;

// Courses worth 2 credit hours instead of the standard 3.
// Covers all University Requirements courses (UNR prefix) plus Entrepreneurship
// Skills (CNC1401). Other CNC courses (business electives) are standard 3-credit.
export const TWO_CREDIT_HOURS = 2;
export const TWO_CREDIT_COURSE_CODES = new Set<string>(["CNC1401"]);

export function isTwoCreditCourse(code: string): boolean {
  return code.startsWith(COURSE_PREFIXES.UNIVERSITY) || TWO_CREDIT_COURSE_CODES.has(code);
}

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = ["application/pdf"];
