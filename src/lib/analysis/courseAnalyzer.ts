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
import {
  ELECTIVE_KEYWORDS,
  SPECIAL_COURSES,
  GRADES,
  canonicalizeCode,
  PRACTICAL_TRAINING_CODE,
  PROBATION_GPA_THRESHOLD,
  isProjectOneTitle,
} from "@/lib/constants";

/**
 * Get elective courses that student has completed
 * Ports Python's get_elective function
 * Excludes ungraded (U) courses — they are in-progress, not completed
 */
export function getCompletedElectives(
  studiedCourses: StudiedCourse[],
  electiveCourses: ElectiveCourse[]
): ElectiveCourse[] {
  const passingGrades = new Set([...GRADES.PASSING] as string[]);
  const completedCodes = new Set(
    studiedCourses
      .filter((c) => passingGrades.has(c.grade))
      .map((c) => canonicalizeCode(c.code))
  );
  const electives: ElectiveCourse[] = [];

  for (const elective of electiveCourses) {
    if (completedCodes.has(canonicalizeCode(elective.code))) {
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
 * Get the student's Practical Training (CIT4000) status from the transcript.
 */
export function getPracticalTrainingStatus(courses: StudiedCourse[]): {
  completed: boolean;
  ungraded: boolean;
} {
  const passingGrades = new Set([...GRADES.PASSING] as string[]);
  const target = canonicalizeCode(PRACTICAL_TRAINING_CODE);
  const course = courses.find((c) => canonicalizeCode(c.code) === target);

  if (!course) {
    return { completed: false, ungraded: false };
  }

  return {
    completed: passingGrades.has(course.grade),
    ungraded: course.grade === "U",
  };
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
  const studiedSet = new Set(studiedCodes.map((c) => canonicalizeCode(c)));
  const prerequisites = prereqCode.split(",").map((p) => p.trim());
  const missing: string[] = [];

  for (const prereq of prerequisites) {
    if (prereq && !studiedSet.has(canonicalizeCode(prereq))) {
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
  creditHours: number,
  gpa: number | null = null
): Course[] {
  // A student on probation (known GPA < 2.0) cannot register Project I.
  const onProbation = gpa !== null && gpa < PROBATION_GPA_THRESHOLD;
  const available: Course[] = [];
  // Normalize studied codes and resolve cross-department equivalences.
  const studiedSet = new Set(studiedCodes.map((c) => canonicalizeCode(c)));
  // Track codes already offered so a course listed under equivalent codes in the
  // same plan (e.g. IS lists both CCS3601 and CAI3101) is offered only once.
  const offeredSet = new Set<string>();

  for (const course of coursePlan) {
    // Normalize plan code and resolve cross-department equivalences.
    const normalizedCode = canonicalizeCode(course.code);

    // Skip if already completed
    if (studiedSet.has(normalizedCode)) {
      continue;
    }

    // Skip if an equivalent code was already offered
    if (offeredSet.has(normalizedCode)) {
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

    // A student on probation cannot register Project I until GPA reaches 2.0
    if (onProbation && isProjectOneTitle(course.title)) {
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
      offeredSet.add(normalizedCode);
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
  const planCodes = new Set(coursePlan.map((c) => canonicalizeCode(c.code)));
  const majorCodes = new Set(
    completedMajorElectives.map((c) => canonicalizeCode(c.code))
  );
  const scienceCodes = new Set(
    completedScienceElectives.map((c) => canonicalizeCode(c.code))
  );
  const universityCodes = new Set(
    completedUniversityElectives.map((c) => canonicalizeCode(c.code))
  );

  return studiedCourses.filter((course) => {
    const code = canonicalizeCode(course.code);
    return (
      !planCodes.has(code) &&
      !majorCodes.has(code) &&
      !scienceCodes.has(code) &&
      !universityCodes.has(code) &&
      !code.startsWith("IT") // Exclude IT courses
    );
  });
}
