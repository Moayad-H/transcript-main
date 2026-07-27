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
  PROBATION_HALF_LOAD_CREDITS,
  PROFESSIONAL_TRAINING_REQUIRED,
  PROFESSIONAL_TRAINING_SEQUENCE,
  isProjectOneTitle,
  isTwoCreditCourse,
  TWO_CREDIT_HOURS,
  CREDIT_HOURS_PER_COURSE,
  NORMAL_LOAD_LOWER_YEARS,
  NORMAL_LOAD_UPPER_YEARS,
  YEAR_UPPER_CREDIT_THRESHOLD,
  YEAR_FOUR_CREDIT_THRESHOLD,
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
 * Get elective courses the student has registered but not yet been graded on (U).
 * These fill an elective slot as "in progress" — mirrors getCompletedElectives
 * but for ungraded courses. (e.g. Advanced Physics / Biochemistry as a Science
 * Elective while the grade is still pending.)
 */
export function getUngradedElectives(
  studiedCourses: StudiedCourse[],
  electiveCourses: ElectiveCourse[]
): ElectiveCourse[] {
  const ungradedCodes = new Set(
    studiedCourses
      .filter((c) => (GRADES.UNGRADED as readonly string[]).includes(c.grade))
      .map((c) => canonicalizeCode(c.code))
  );
  return electiveCourses.filter((elective) =>
    ungradedCodes.has(canonicalizeCode(elective.code))
  );
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
    // The plan CSVs list many Professional Training options to choose from, but
    // only a fixed number are actually required. Cap the counted requirement so
    // the menu of options never inflates it.
    professionalTraining: Math.min(
      professionalTraining,
      PROFESSIONAL_TRAINING_REQUIRED
    ),
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
 * Remedial slots a student has effectively bypassed, so they should never be
 * rendered as outstanding work.
 *
 * A remedial course is only owed when the student actually sat it and did not
 * pass (see processRemedialCourses). But a student who never appears against a
 * remedial row at all, and has since cleared the course it remediates, has
 * placed out of it — the placement test waived it. Showing it as blocked/
 * available is noise.
 *
 * - Precalculus (EBA0201): waived once any Calculus course is passed.
 * - Remedial English (GLA0001): waived once Academic English or Academic
 *   Writing is passed.
 *
 * Returns the canonicalized codes to hide.
 */
export function getWaivedRemedialCodes(
  studiedCourses: StudiedCourse[]
): Set<string> {
  const passingGrades = new Set([...GRADES.PASSING] as string[]);
  const waived = new Set<string>();

  const titleOf = (c: StudiedCourse) => c.title.toLowerCase();
  const attempted = (match: (title: string) => boolean) =>
    studiedCourses.some((c) => match(titleOf(c)));
  const passed = (match: (title: string) => boolean) =>
    studiedCourses.some((c) => passingGrades.has(c.grade) && match(titleOf(c)));

  const isPrecalculus = (t: string) => t.includes("precalculus");
  const isCalculus = (t: string) => t.includes("calculus") && !isPrecalculus(t);
  const isRemedialEnglish = (t: string) => t.includes("remedial english");
  const isEnglishReplacement = (t: string) =>
    t.includes("academic english") || t.includes("academic writing");

  if (!attempted(isPrecalculus) && passed(isCalculus)) {
    waived.add(canonicalizeCode(SPECIAL_COURSES.PRECALCULUS));
  }
  if (!attempted(isRemedialEnglish) && passed(isEnglishReplacement)) {
    waived.add(canonicalizeCode(SPECIAL_COURSES.REMEDIAL_ENGLISH));
  }

  return waived;
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
 * Split the eligible-course pool from getAvailableCourses() into:
 *   - recommended: the priority list for the current semester (group A), and
 *   - otherEligible: courses the student may register but shouldn't prioritize (group B).
 *
 * This changes no eligibility — it only ranks and caps an already-eligible pool.
 *
 * Ranking: by department-plan semester (earliest first), then core-before-elective
 * within a semester, then original plan order. Courses absent from the plan map sort
 * last. Group A is the highest-priority prefix whose cumulative credit value fits a
 * normal-load cap; the first course that would overflow, and everything after it,
 * falls to group B (so A stays a contiguous, coherent semester).
 *
 * The cap depends on academic standing/year (earned credit hours):
 *   - on probation  -> PROBATION_HALF_LOAD_CREDITS (12) regardless of year
 *   - years 3–4 (earned >= YEAR_UPPER_CREDIT_THRESHOLD) -> NORMAL_LOAD_UPPER_YEARS (15)
 *   - years 1–2     -> NORMAL_LOAD_LOWER_YEARS (18)
 */
export function splitAvailableCourses(
  availableCourses: Course[],
  codeToSemester: Map<string, number> | null,
  completedCreditHours: number,
  onProbation: boolean
): { recommended: Course[]; otherEligible: Course[] } {
  const cap = onProbation
    ? PROBATION_HALF_LOAD_CREDITS
    : completedCreditHours >= YEAR_UPPER_CREDIT_THRESHOLD
      ? NORMAL_LOAD_UPPER_YEARS
      : NORMAL_LOAD_LOWER_YEARS;

  // An available concrete course reads as an elective if its title carries an
  // elective keyword (same set getAvailableCourses uses to skip placeholder rows);
  // core courses are prioritized ahead of electives within the same semester.
  const isElectiveTitle = (title: string): boolean =>
    Object.values(ELECTIVE_KEYWORDS).some((kw) => title.includes(kw));

  const semesterOf = (course: Course): number =>
    codeToSemester?.get(canonicalizeCode(course.code)) ?? Infinity;

  // Stable sort: preserve original plan order as the final tiebreak.
  const ranked = availableCourses
    .map((course, index) => ({ course, index }))
    .sort((a, b) => {
      const semDiff = semesterOf(a.course) - semesterOf(b.course);
      if (semDiff !== 0) return semDiff;
      const electiveDiff =
        Number(isElectiveTitle(a.course.title)) -
        Number(isElectiveTitle(b.course.title));
      if (electiveDiff !== 0) return electiveDiff;
      return a.index - b.index;
    })
    .map((entry) => entry.course);

  const recommended: Course[] = [];
  const otherEligible: Course[] = [];
  let running = 0;
  let capReached = false;

  for (const course of ranked) {
    const value = isTwoCreditCourse(canonicalizeCode(course.code))
      ? TWO_CREDIT_HOURS
      : CREDIT_HOURS_PER_COURSE;
    if (!capReached && running + value <= cap) {
      recommended.push(course);
      running += value;
    } else {
      capReached = true;
      otherEligible.push(course);
    }
  }

  return { recommended, otherEligible };
}

/**
 * Get the major-elective courses a student can register right now.
 *
 * Major electives are real courses listed in the department's Major CSV, but
 * getAvailableCourses() skips them — the course plan carries only a "Major
 * Elective" placeholder row, not the concrete options. So a student with an open
 * major-elective slot never sees which actual courses fill it. This surfaces
 * that menu: the electives not already taken whose prerequisites are met.
 *
 * Only advised to year-4 students — major electives are Semester 7–8 courses in
 * every department plan, so the menu stays hidden until the student reaches year
 * 4 (earned >= YEAR_FOUR_CREDIT_THRESHOLD). Returns [] before year 4, and once
 * every slot is filled (remaining <= 0), so the section only shows when it's
 * both due and actionable.
 */
export function getAvailableMajorElectives(
  majorElectives: ElectiveCourse[],
  studiedCodes: string[],
  creditHours: number,
  remainingMajorElectives: number
): Course[] {
  if (remainingMajorElectives <= 0) return [];
  if (creditHours < YEAR_FOUR_CREDIT_THRESHOLD) return [];

  const studiedSet = new Set(studiedCodes.map((c) => canonicalizeCode(c)));
  const offered = new Set<string>();
  const available: Course[] = [];

  for (const elective of majorElectives) {
    const code = canonicalizeCode(elective.code);
    if (studiedSet.has(code) || offered.has(code)) continue;

    const course: Course = {
      code: elective.code,
      title: elective.title,
      prerequisiteCode: elective.prerequisiteCode,
    };
    if (checkPrerequisites(course, studiedCodes, creditHours).met) {
      available.push(course);
      offered.add(code);
    }
  }

  return available;
}

/**
 * Get the next Professional Training course a student should register.
 *
 * Professional Training is a fixed four-slot sequence taken one per semester
 * from Semester 5 onward (PROFESSIONAL_TRAINING_SEQUENCE): Mobile Apps (CIT3200),
 * then a track-specific I / II / III. How many the student has done is
 * remaining-derived, so the next slot is index (length - remaining). We return
 * just that next slot — the one due this semester — matching the graph view's
 * per-semester ordering.
 *
 * Only advised from year 3, when the sequence starts (earned >=
 * YEAR_UPPER_CREDIT_THRESHOLD). Returns [] before year 3 and once all four slots
 * are done (remaining <= 0), so section D only shows when it's due and actionable.
 */
export function getAvailableProfessionalTraining(
  remainingProfessionalTraining: number,
  creditHours: number
): Course[] {
  if (remainingProfessionalTraining <= 0) return [];
  if (creditHours < YEAR_UPPER_CREDIT_THRESHOLD) return [];

  const nextIndex =
    PROFESSIONAL_TRAINING_SEQUENCE.length - remainingProfessionalTraining;
  const slot = PROFESSIONAL_TRAINING_SEQUENCE[nextIndex];
  if (!slot) return [];

  return [{ code: slot.code, title: slot.title, prerequisiteCode: "" }];
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
