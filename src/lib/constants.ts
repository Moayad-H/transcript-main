/**
 * Application constants
 */

import { Department } from "@/types";

export const DEPARTMENTS: Department[] = ["CS", "SE", "IS", "CY", "AI", "GM"];

export const DEPARTMENT_NAMES: Record<Department, string> = {
  CS: "Computer Science",
  SE: "Software Engineering",
  IS: "Information Systems",
  CY: "Cybersecurity",
  AI: "Artificial Intelligence",
  GM: "Game Development",
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

export const CREDIT_HOURS_PER_COURSE = 3;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const ALLOWED_FILE_TYPES = ["application/pdf"];
