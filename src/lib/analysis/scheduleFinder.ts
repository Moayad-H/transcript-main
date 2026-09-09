/**
 * Schedule Finder Engine
 * Finds the optimal timetable schedule for a student's recommended courses.
 *
 * Rules:
 * 1. Priority is to register all courses from one base group.
 * 2. If a subject is not in the base group, find the appropriate group for that subject
 *    by looking up its placement in the department plans to know the term it belongs to.
 * 3. Detect and prevent time-slot collisions between courses.
 * 4. Support interactive group swapping and multi-solution ranking.
 */

import {
  GroupSchedule,
  ScheduleSolution,
  CourseAssignment,
  CandidateGroupOption,
  ScheduleSlot,
  DayOfWeek,
  PeriodNumber,
} from "@/types/schedule";
import { getCourseTerm, normalizeCode } from "./departmentPlanMapper";

export interface TargetCourseInput {
  code: string;
  title: string;
}

export interface FindScheduleOptions {
  studentDepartment: string;
  targetCourses: TargetCourseInput[];
  allGroups: GroupSchedule[];
  preferredBaseGroupName?: string;
}

/**
 * Check if two sets of slots have any overlap (same day and same period)
 */
export function hasSlotCollision(slotsA: ScheduleSlot[], slotsB: ScheduleSlot[]): boolean {
  for (const a of slotsA) {
    for (const b of slotsB) {
      if (a.day === b.day && a.period === b.period) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Find collision details between course slots and an existing slot map
 */
export function findCollidingCourses(
  slots: ScheduleSlot[],
  occupiedGrid: Map<string, string>
): string[] {
  const colliders = new Set<string>();
  for (const slot of slots) {
    const key = `${slot.day}_${slot.period}`;
    const existing = occupiedGrid.get(key);
    if (existing) {
      colliders.add(existing);
    }
  }
  return Array.from(colliders);
}

/**
 * Main Schedule Finder: generates ranked schedule solutions for the student's target courses
 */
export function findSchedules({
  studentDepartment,
  targetCourses,
  allGroups,
  preferredBaseGroupName,
}: FindScheduleOptions): ScheduleSolution[] {
  if (!targetCourses || targetCourses.length === 0 || !allGroups || allGroups.length === 0) {
    return [];
  }

  // Deduplicate target courses by normalized code
  const uniqueTargets: TargetCourseInput[] = [];
  const seenCodes = new Set<string>();
  for (const tc of targetCourses) {
    const norm = normalizeCode(tc.code);
    if (!norm || seenCodes.has(norm)) continue;
    seenCodes.add(norm);
    uniqueTargets.push(tc);
  }

  // Map each target course to its term in the department plan
  const courseTerms = new Map<string, number>();
  const termCounts = new Map<number, number>();

  for (const tc of uniqueTargets) {
    const term = getCourseTerm(tc.code, studentDepartment) || 1;
    courseTerms.set(normalizeCode(tc.code), term);
    termCounts.set(term, (termCounts.get(term) || 0) + 1);
  }

  // Determine dominant semester among target courses
  let dominantSemester = 1;
  let maxCount = -1;
  termCounts.forEach((count, term) => {
    if (count > maxCount) {
      maxCount = count;
      dominantSemester = term;
    }
  });

  // Pre-index all groups for fast lookups
  // 1. Groups by groupName
  const groupsByName = new Map<string, GroupSchedule>();
  // 2. Groups offering a specific course code
  const groupsByCourse = new Map<string, GroupSchedule[]>();

  for (const grp of allGroups) {
    groupsByName.set(grp.groupName.toUpperCase(), grp);
    for (const c of grp.courses) {
      const norm = normalizeCode(c.code);
      if (!groupsByCourse.has(norm)) {
        groupsByCourse.set(norm, []);
      }
      groupsByCourse.get(norm)!.push(grp);
    }
  }

  // Select candidate base groups:
  // Prefer groups matching the dominant semester and department, or matching preferredBaseGroupName
  let candidateBaseGroups: GroupSchedule[] = [];

  if (preferredBaseGroupName) {
    const specific = groupsByName.get(preferredBaseGroupName.toUpperCase());
    if (specific) {
      candidateBaseGroups = [specific];
    }
  }

  if (candidateBaseGroups.length === 0) {
    // Look for groups matching dominant semester and student department
    candidateBaseGroups = allGroups.filter(
      (g) =>
        g.semester === dominantSemester &&
        g.department.toUpperCase() === studentDepartment.toUpperCase()
    );

    // If none found for that specific department, fallback to dominant semester any department
    if (candidateBaseGroups.length === 0) {
      candidateBaseGroups = allGroups.filter((g) => g.semester === dominantSemester);
    }

    // If still none, consider all groups
    if (candidateBaseGroups.length === 0) {
      candidateBaseGroups = allGroups;
    }
  }

  // Build solutions for each candidate base group
  const solutions: ScheduleSolution[] = [];

  for (const baseGroup of candidateBaseGroups) {
    const solution = buildSolutionForBaseGroup({
      baseGroup,
      targetCourses: uniqueTargets,
      studentDepartment,
      courseTerms,
      groupsByCourse,
    });
    solutions.push(solution);
  }

  // Rank solutions:
  // 1. Conflict-free first (hasConflicts === false)
  // 2. Highest base group coverage (coveredInBaseCount DESC)
  // 3. Lowest number of conflicting courses (conflictCourses.length ASC)
  // 4. Lowest number of different groups used ASC
  solutions.sort((a, b) => {
    if (a.hasConflicts !== b.hasConflicts) {
      return a.hasConflicts ? 1 : -1;
    }
    if (b.coveredInBaseCount !== a.coveredInBaseCount) {
      return b.coveredInBaseCount - a.coveredInBaseCount;
    }
    if (a.conflictCourses.length !== b.conflictCourses.length) {
      return a.conflictCourses.length - b.conflictCourses.length;
    }
    // Count distinct groups used
    const groupsA = new Set(a.assignments.map((as) => as.assignedGroup)).size;
    const groupsB = new Set(b.assignments.map((as) => as.assignedGroup)).size;
    return groupsA - groupsB;
  });

  return solutions;
}

/**
 * Builds a concrete timetable solution given a base group
 */
function buildSolutionForBaseGroup({
  baseGroup,
  targetCourses,
  studentDepartment,
  courseTerms,
  groupsByCourse,
}: {
  baseGroup: GroupSchedule;
  targetCourses: TargetCourseInput[];
  studentDepartment: string;
  courseTerms: Map<string, number>;
  groupsByCourse: Map<string, GroupSchedule[]>;
}): ScheduleSolution {
  // Grid tracking occupied slots: key "day_period" -> courseCode
  const occupiedGrid = new Map<string, string>();
  const assignments: CourseAssignment[] = [];
  const conflictCourses: string[] = [];
  let coveredInBaseCount = 0;

  // Map courses available directly inside baseGroup
  const baseCourseMap = new Map<string, { code: string; title: string; slots: ScheduleSlot[] }>();
  for (const c of baseGroup.courses) {
    baseCourseMap.set(normalizeCode(c.code), c);
  }

  // Separate targets into:
  // (A) Available in base group
  // (B) Missing from base group
  const inBase: TargetCourseInput[] = [];
  const missing: TargetCourseInput[] = [];

  for (const tc of targetCourses) {
    const norm = normalizeCode(tc.code);
    if (baseCourseMap.has(norm)) {
      inBase.push(tc);
    } else {
      missing.push(tc);
    }
  }

  // Phase 1: Assign all courses available in the base group (100% collision-free among themselves)
  for (const tc of inBase) {
    const norm = normalizeCode(tc.code);
    const courseInBase = baseCourseMap.get(norm)!;
    const slots = courseInBase.slots;

    for (const slot of slots) {
      occupiedGrid.set(`${slot.day}_${slot.period}`, tc.code);
    }

    coveredInBaseCount++;

    // Collect candidate groups for future user switching
    const offeringGroups = groupsByCourse.get(norm) || [];
    const candidateGroups: CandidateGroupOption[] = offeringGroups.map((grp) => {
      const c = grp.courses.find((gc) => normalizeCode(gc.code) === norm);
      const grpSlots = c?.slots || [];
      return {
        groupName: grp.groupName,
        slots: grpSlots,
        hasConflict: false, // will be evaluated dynamically in UI if switched
      };
    });

    assignments.push({
      courseCode: tc.code,
      courseTitle: courseInBase.title || tc.title,
      assignedGroup: baseGroup.groupName,
      isAlternativeGroup: false,
      targetTerm: courseTerms.get(norm) || baseGroup.semester,
      slots,
      candidateGroups,
    });
  }

  // Phase 2: For courses missing from the base group:
  // Look up placement in department plan to identify target term and appropriate groups
  for (const tc of missing) {
    const norm = normalizeCode(tc.code);
    const targetTerm = courseTerms.get(norm) || 1;
    const offeringGroups = groupsByCourse.get(norm) || [];

    // Prioritize candidate groups:
    // Tier 1: Groups matching targetTerm and student's department
    // Tier 2: Groups matching targetTerm (other departments)
    // Tier 3: Groups matching student's department (other terms)
    // Tier 4: Any group offering the course
    const rankedOfferingGroups = [...offeringGroups].sort((g1, g2) => {
      const g1DeptMatch = g1.department.toUpperCase() === studentDepartment.toUpperCase();
      const g2DeptMatch = g2.department.toUpperCase() === studentDepartment.toUpperCase();
      const g1TermMatch = g1.semester === targetTerm;
      const g2TermMatch = g2.semester === targetTerm;

      const score1 = (g1TermMatch ? 4 : 0) + (g1DeptMatch ? 2 : 0);
      const score2 = (g2TermMatch ? 4 : 0) + (g2DeptMatch ? 2 : 0);
      return score2 - score1;
    });

    // Evaluate candidate groups for collisions
    let chosenGroup: GroupSchedule | null = null;
    let chosenSlots: ScheduleSlot[] = [];
    let chosenColliders: string[] = [];

    const candidateOptions: CandidateGroupOption[] = [];

    for (const candGrp of rankedOfferingGroups) {
      const candCourse = candGrp.courses.find((c) => normalizeCode(c.code) === norm);
      if (!candCourse) continue;

      const candSlots = candCourse.slots;
      const colliders = findCollidingCourses(candSlots, occupiedGrid);
      const hasConflict = colliders.length > 0;

      candidateOptions.push({
        groupName: candGrp.groupName,
        slots: candSlots,
        hasConflict,
        conflictingCourses: colliders,
      });

      // Pick the first collision-free candidate group
      if (!chosenGroup && !hasConflict) {
        chosenGroup = candGrp;
        chosenSlots = candSlots;
        chosenColliders = [];
      }
    }

    // If no collision-free group was found, pick the top-ranked group anyway and flag collision
    if (!chosenGroup && rankedOfferingGroups.length > 0) {
      chosenGroup = rankedOfferingGroups[0];
      const candCourse = chosenGroup.courses.find((c) => normalizeCode(c.code) === norm);
      chosenSlots = candCourse?.slots || [];
      chosenColliders = findCollidingCourses(chosenSlots, occupiedGrid);
      conflictCourses.push(tc.code);
    } else if (chosenGroup) {
      // Register chosen slots in occupied grid
      for (const slot of chosenSlots) {
        occupiedGrid.set(`${slot.day}_${slot.period}`, tc.code);
      }
    } else {
      // Course is not offered in ANY schedule group
      conflictCourses.push(tc.code);
    }

    assignments.push({
      courseCode: tc.code,
      courseTitle: tc.title,
      assignedGroup: chosenGroup ? chosenGroup.groupName : "Not Offered",
      isAlternativeGroup: true,
      targetTerm,
      slots: chosenSlots,
      conflictWith: chosenColliders.length > 0 ? chosenColliders : undefined,
      candidateGroups: candidateOptions,
    });
  }

  return {
    id: `sol-${baseGroup.groupName}`,
    baseGroup: baseGroup.groupName,
    semester: baseGroup.semester,
    department: baseGroup.department,
    coveredInBaseCount,
    totalCoursesCount: targetCourses.length,
    assignments,
    hasConflicts: conflictCourses.length > 0,
    conflictCourses,
  };
}

/**
 * Re-evaluates a schedule solution when an advisor manually changes the assigned group for a course
 */
export function recomputeScheduleWithGroupChange(
  currentSolution: ScheduleSolution,
  courseCode: string,
  newGroupName: string,
  allGroups: GroupSchedule[]
): ScheduleSolution {
  const normTarget = normalizeCode(courseCode);
  const targetGrp = allGroups.find(
    (g) => g.groupName.toUpperCase() === newGroupName.toUpperCase()
  );

  const updatedAssignments = currentSolution.assignments.map((as) => {
    if (normalizeCode(as.courseCode) !== normTarget) {
      return as;
    }
    if (!targetGrp) return as;

    const courseInGrp = targetGrp.courses.find((c) => normalizeCode(c.code) === normTarget);
    const newSlots = courseInGrp?.slots || [];

    return {
      ...as,
      assignedGroup: targetGrp.groupName,
      isAlternativeGroup: targetGrp.groupName !== currentSolution.baseGroup,
      slots: newSlots,
    };
  });

  // Re-check all collisions across the timetable
  const occupied = new Map<string, string[]>();
  for (const as of updatedAssignments) {
    for (const s of as.slots) {
      const key = `${s.day}_${s.period}`;
      if (!occupied.has(key)) occupied.set(key, []);
      occupied.get(key)!.push(as.courseCode);
    }
  }

  const conflictCourses = new Set<string>();
  const finalAssignments = updatedAssignments.map((as) => {
    const colliders = new Set<string>();
    for (const s of as.slots) {
      const key = `${s.day}_${s.period}`;
      const occupants = occupied.get(key) || [];
      for (const occ of occupants) {
        if (occ !== as.courseCode) {
          colliders.add(occ);
        }
      }
    }
    if (colliders.size > 0) {
      conflictCourses.add(as.courseCode);
    }
    return {
      ...as,
      conflictWith: colliders.size > 0 ? Array.from(colliders) : undefined,
    };
  });

  return {
    ...currentSolution,
    assignments: finalAssignments,
    hasConflicts: conflictCourses.size > 0,
    conflictCourses: Array.from(conflictCourses),
  };
}
