/**
 * Course Analysis Engine
 * Ports core business logic from drudgery_v7.py
 */

import {
  Course,
  ElectiveCourse,
  StudiedCourse,
  CourseRequirement,
} from "@/types";
import { ELECTIVE_KEYWORDS, SPECIAL_COURSES, GRADES } from "@/lib/constants";

/**
 * Get elective courses that student has completed
 * Ports Python's get_elective function
 */
export function getCompletedElectives(
  studiedCodes: string[],
  electiveCourses: ElectiveCourse[]
): ElectiveCourse[] {
  const studiedSet = new Set(studiedCodes.map((code) => code.trim()));
  const electives: ElectiveCourse[] = [];

  for (const elective of electiveCourses) {
    if (studiedSet.has(elective.code.trim())) {
      electives.push(elective);
    }
  }

  return electives;
}

/**
 * Count required elective courses from course plan
 * Ports Python's get_Count function
 */
export function getElectiveRequirements(courses: Course[]): CourseRequirement {
  let professionalTraining = 0;
  let scienceElectives = 0;
  let majorElectives = 0;
  let universityRequirements = 0;

  for (const course of courses) {
    const title = course.title;

    if (title.includes(ELECTIVE_KEYWORDS.PROFESSIONAL)) {
      professionalTraining++;
    } else if (title.includes(ELECTIVE_KEYWORDS.SCIENCE)) {
      scienceElectives++;
    } else if (title.includes(ELECTIVE_KEYWORDS.MAJOR)) {
      majorElectives++;
    } else if (title.includes(ELECTIVE_KEYWORDS.UNIVERSITY)) {
      universityRequirements++;
    }
  }

  return {
    professionalTraining,
    scienceElectives,
    majorElectives,
    universityRequirements,
  };
}

/**
 * Get professional training courses from student's transcript
 * Ports Python's get_prof function
 */
export function getProfessionalTraining(courses: StudiedCourse[]): string[] {
  const passingGrades = new Set([...GRADES.PASSING, "U"] as string[]);
  return courses
    .filter(
      (course) =>
        course.title.includes(ELECTIVE_KEYWORDS.PROFESSIONAL) &&
        passingGrades.has(course.grade)
    )
    .map((course) => course.title);
}

/**
 * Remove electives that are already in the core curriculum
 * Ports Python's remove_elective_in_Core function
 */
export function removeElectivesInCore(
  coreCourses: Course[],
  electiveCourses: ElectiveCourse[]
): ElectiveCourse[] {
  const coreCodes = new Set(coreCourses.map((c) => c.code.trim()));
  return electiveCourses.filter((e) => !coreCodes.has(e.code.trim()));
}

/**
 * Check if prerequisites are met for a course
 */
export function checkPrerequisites(
  course: Course,
  studiedCodes: string[],
  creditHours: number
): { met: boolean; missing: string[] } {
  const prereqCode = course.prerequisiteCode.trim();

  // No prerequisites
  if (prereqCode === "-" || prereqCode === "") {
    return { met: true, missing: [] };
  }

  // Credit hour requirement (e.g., "30 CR or more")
  if (prereqCode.includes("CR")) {
    const match = prereqCode.match(/(\d+)\s*CR/);
    if (match) {
      const required = parseInt(match[1], 10);
      return {
        met: creditHours >= required,
        missing: creditHours < required ? [`${required} credit hours`] : [],
      };
    }
  }

  // Multiple prerequisites (comma-separated)
  const prerequisites = prereqCode.split(",").map((p) => p.trim());
  const missing: string[] = [];

  for (const prereq of prerequisites) {
    if (prereq && !studiedCodes.includes(prereq)) {
      missing.push(prereq);
    }
  }

  return {
    met: missing.length === 0,
    missing,
  };
}

/**
 * Get courses student can register for
 * Ports Python's get_remaining_courses function
 */
export function getAvailableCourses(
  coursePlan: Course[],
  studiedCodes: string[],
  professionalTrainingCount: number,
  remedialCourses: string[],
  creditHours: number
): Course[] {
  const available: Course[] = [];
  // Normalize studied codes: keep only alphanumeric characters
  const studiedSet = new Set(
    studiedCodes.map((c) => c.replace(/[^A-Z0-9]/gi, "").toUpperCase())
  );

  for (const course of coursePlan) {
    // Normalize plan code: keep only alphanumeric characters
    const normalizedCode = course.code.replace(/[^A-Z0-9]/gi, "").toUpperCase();

    // Skip if already completed
    if (studiedSet.has(normalizedCode)) {
      continue;
    }

    // Skip professional training electives
    if (course.title.includes(ELECTIVE_KEYWORDS.PROFESSIONAL)) {
      continue;
    }

    // Skip science electives
    if (course.title.includes(ELECTIVE_KEYWORDS.SCIENCE)) {
      continue;
    }

    // Skip university requirement electives
    if (course.title.includes(ELECTIVE_KEYWORDS.UNIVERSITY)) {
      continue;
    }

    // Skip major electives
    if (course.title.includes(ELECTIVE_KEYWORDS.MAJOR)) {
      continue;
    }

    // Handle special cases for remedial courses
    if (
      normalizedCode === SPECIAL_COURSES.PRECALCULUS &&
      !remedialCourses.includes("Precalculus")
    ) {
      continue; // Already passed precalculus
    }

    if (
      normalizedCode === SPECIAL_COURSES.REMEDIAL_ENGLISH &&
      !remedialCourses.includes("Remedial English")
    ) {
      continue; // Already passed remedial English
    }

    // Skip UNR1403 if remedial English not required
    if (
      normalizedCode === "UNR1403" &&
      remedialCourses.includes("Remedial English")
    ) {
      continue;
    }

    // Skip EBA1203 (Calculus I) if precalculus required
    if (
      normalizedCode === "EBA1203" &&
      remedialCourses.includes("Precalculus")
    ) {
      continue;
    }

    // Check prerequisites
    const prereqCheck = checkPrerequisites(course, studiedCodes, creditHours);
    if (prereqCheck.met) {
      available.push(course);
    }
  }

  return available;
}

/**
 * Get courses that are not in the official plan
 * Ports Python's get_out_of_plan_Courses function
 */
export function getOutOfPlanCourses(
  coursePlan: Course[],
  studiedCourses: StudiedCourse[],
  completedMajorElectives: ElectiveCourse[],
  completedScienceElectives: ElectiveCourse[],
  completedUniversityElectives: ElectiveCourse[]
): StudiedCourse[] {
  const planCodes = new Set(coursePlan.map((c) => c.code.trim()));
  const majorCodes = new Set(completedMajorElectives.map((c) => c.code.trim()));
  const scienceCodes = new Set(
    completedScienceElectives.map((c) => c.code.trim())
  );
  const universityCodes = new Set(
    completedUniversityElectives.map((c) => c.code.trim())
  );

  return studiedCourses.filter((course) => {
    const code = course.code.trim();
    return (
      !planCodes.has(code) &&
      !majorCodes.has(code) &&
      !scienceCodes.has(code) &&
      !universityCodes.has(code) &&
      !code.startsWith("IT") // Exclude IT courses
    );
  });
}
