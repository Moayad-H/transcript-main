/**
 * Report Generation Engine
 * Generates comprehensive academic advising reports
 */

import {
  AnalysisReport,
  TranscriptData,
  Department,
  StudiedCourse,
} from "@/types";
import { loadDepartmentData } from "@/lib/data/csvLoader";
import {
  getStudiedCourseCodes,
  getUngradedCourses,
  calculateCreditHours,
  calculateUngradedCreditHours,
  getWithdrawnFailedCourses,
} from "./transcriptParser";
import {
  getCompletedElectives,
  getUngradedElectives,
  getElectiveRequirements,
  getProfessionalTraining,
  getPracticalTrainingStatus,
  removeElectivesInCore,
  getAvailableCourses,
  splitAvailableCourses,
  getAvailableMajorElectives,
  getAvailableElectives,
  getAvailableProfessionalTraining,
  getOutOfPlanCourses,
} from "./courseAnalyzer";
import { loadPlanSemesters } from "./courseGraphBuilder";
import { getLatestSemester, getRetakeRecommendations } from "./semester";
import {
  PRACTICAL_TRAINING_MIN_CREDIT_HOURS,
  GRADUATION_CREDIT_HOURS,
  PROBATION_GPA_THRESHOLD,
  PROBATION_MAX_SEMESTERS,
  TWO_CREDIT_HOURS,
} from "@/lib/constants";

/**
 * Generate complete analysis report for a student
 */
export async function generateReport(
  studentName: string,
  department: Department,
  transcriptData: TranscriptData
): Promise<AnalysisReport> {
  // Load department-specific data
  const {
    courses: coursePlan,
    majorElectives,
    scienceElectives,
    universityElectives,
  } = await loadDepartmentData(department);

  // Remove electives that are in core curriculum
  const cleanScienceElectives = removeElectivesInCore(
    coursePlan,
    scienceElectives
  );
  const cleanUniversityElectives = removeElectivesInCore(
    coursePlan,
    universityElectives
  );

  // Extract student's course data
  const studiedCodes = getStudiedCourseCodes(transcriptData.courses);

  const ungradedCourses = getUngradedCourses(transcriptData.courses);
  const withdrawnFailedCourses = getWithdrawnFailedCourses(transcriptData.courses);
  const professionalTraining = getProfessionalTraining(transcriptData.courses);
  const practicalTraining = getPracticalTrainingStatus(transcriptData.courses);

  // Calculate credit hours
  const creditHours = calculateCreditHours(
    transcriptData.courses,
    professionalTraining.length
  );
  const ungradedCreditHours = calculateUngradedCreditHours(transcriptData.courses);

  // Academic probation: known cumulative GPA below the 2.0 threshold.
  // Exception: GPA of exactly 0 with earned credit hours means a transfer
  // student (all courses graded Tr, which carry no grade points) — not a
  // failing student, so never half-load them.
  const gpa = transcriptData.gpa ?? null;
  const isLikelyTransfer = gpa === 0 && creditHours > 0;
  const onProbation =
    gpa !== null && gpa < PROBATION_GPA_THRESHOLD && !isLikelyTransfer;
  const probationSemesters = transcriptData.probationSemesters ?? 0;

  // Get completed electives
  const completedMajorElectives = getCompletedElectives(
    transcriptData.courses,
    majorElectives
  );
  const completedScienceElectives = getCompletedElectives(
    transcriptData.courses,
    cleanScienceElectives
  );
  const completedUniversityElectives = getCompletedElectives(
    transcriptData.courses,
    cleanUniversityElectives
  );

  // Registered-but-ungraded electives (fill a slot as "in progress")
  const ungradedMajorElectives = getUngradedElectives(
    transcriptData.courses,
    majorElectives
  );
  const ungradedScienceElectives = getUngradedElectives(
    transcriptData.courses,
    cleanScienceElectives
  );
  const ungradedUniversityElectives = getUngradedElectives(
    transcriptData.courses,
    cleanUniversityElectives
  );

  // Get requirements count
  const requirements = getElectiveRequirements(coursePlan);

  // Get available courses for registration
  const availableCourses = getAvailableCourses(
    coursePlan,
    studiedCodes,
    professionalTraining.length,
    transcriptData.remedialCourses,
    creditHours,
    gpa,
    department
  );

  // Split the eligible pool into a capped, priority "recommended this semester"
  // list (group A) and the remaining eligible courses (group B), ranked by the
  // department plan sequence.
  const planSemesters = await loadPlanSemesters(department);
  const { recommended: recommendedCourses, otherEligible: otherEligibleCourses } =
    splitAvailableCourses(
      availableCourses,
      planSemesters?.codeToSemester ?? null,
      creditHours,
      onProbation
    );

  // Get out-of-plan courses
  const outOfPlanCourses = getOutOfPlanCourses(
    coursePlan,
    transcriptData.courses.filter((c) => !withdrawnFailedCourses.includes(c) && !ungradedCourses.includes(c)),
    completedMajorElectives,
    completedScienceElectives,
    completedUniversityElectives
  );

  const remainingMajorElectives = Math.max(
    0,
    requirements.majorElectives - completedMajorElectives.length
  );
  // The concrete major-elective courses fillable right now (section C).
  const availableMajorElectives = getAvailableMajorElectives(
    majorElectives,
    studiedCodes,
    creditHours,
    remainingMajorElectives
  );
  const remainingScienceElectives = Math.max(
    0,
    requirements.scienceElectives - completedScienceElectives.length
  );
  // The concrete science-elective courses fillable right now (section E).
  const availableScienceElectives = getAvailableElectives(
    cleanScienceElectives,
    studiedCodes,
    creditHours,
    remainingScienceElectives
  );
  const remainingUniversityRequirements = Math.max(
    0,
    requirements.universityRequirements - completedUniversityElectives.length
  );
  // The concrete university-requirement courses fillable right now (section F).
  const availableUniversityRequirements = getAvailableElectives(
    cleanUniversityElectives,
    studiedCodes,
    creditHours,
    remainingUniversityRequirements
  );
  // Special case: only ONE University Elective is required, but a student can
  // mistakenly register/pass more than one. Every surplus one is a 2 Cr. UNR
  // course that satisfies no requirement — flag it so the advisor can act.
  const registeredUniversityElectives =
    completedUniversityElectives.length + ungradedUniversityElectives.length;
  const extraUniversityElectiveCount = Math.max(
    0,
    registeredUniversityElectives - requirements.universityRequirements
  );
  const extraUniversityElectiveCredits =
    extraUniversityElectiveCount * TWO_CREDIT_HOURS;

  const remainingProfessionalTraining = Math.max(
    0,
    requirements.professionalTraining - professionalTraining.length
  );
  // The next Professional Training slot fillable right now (section D).
  const availableProfessionalTraining = getAvailableProfessionalTraining(
    remainingProfessionalTraining,
    creditHours
  );

  // Graduation: the 132 credit-hour requirement plus every outstanding
  // requirement (electives, professional + practical training) cleared.
  const graduationCreditRequirementMet = creditHours >= GRADUATION_CREDIT_HOURS;
  const creditHoursToGraduation = Math.max(
    0,
    GRADUATION_CREDIT_HOURS - creditHours
  );
  // A student cannot graduate while on probation (GPA below 2.0). Unknown GPA
  // doesn't block (e.g. manual entry with no GPA figure).
  const gpaMeetsGraduation =
    gpa === null || gpa >= PROBATION_GPA_THRESHOLD || isLikelyTransfer;
  const graduationEligible =
    graduationCreditRequirementMet &&
    remainingMajorElectives === 0 &&
    remainingScienceElectives === 0 &&
    remainingUniversityRequirements === 0 &&
    remainingProfessionalTraining === 0 &&
    practicalTraining.completed &&
    gpaMeetsGraduation;

  return {
    studentName,
    department,
    ungradedCourses,
    withdrawnFailedCourses,
    availableCourses,
    recommendedCourses,
    otherEligibleCourses,
    completedMajorElectives,
    ungradedMajorElectives,
    remainingMajorElectives,
    availableMajorElectives,
    completedScienceElectives,
    ungradedScienceElectives,
    remainingScienceElectives,
    availableScienceElectives,
    completedUniversityRequirements: completedUniversityElectives,
    ungradedUniversityRequirements: ungradedUniversityElectives,
    remainingUniversityRequirements,
    availableUniversityRequirements,
    extraUniversityElectiveCount,
    extraUniversityElectiveCredits,
    completedProfessionalTraining: professionalTraining,
    remainingProfessionalTraining,
    availableProfessionalTraining,
    practicalTrainingCompleted: practicalTraining.completed,
    practicalTrainingUngraded: practicalTraining.ungraded,
    practicalTrainingEligible: creditHours >= PRACTICAL_TRAINING_MIN_CREDIT_HOURS,
    practicalTrainingWarning:
      creditHours >= GRADUATION_CREDIT_HOURS && !practicalTraining.completed,
    outOfPlanCourses,
    latestSemester: getLatestSemester(transcriptData.courses),
    retakeRecommendations: getRetakeRecommendations(transcriptData.courses),
    totalCreditHours: creditHours,
    expectedCreditHours: creditHours + ungradedCreditHours,
    completedCourses: transcriptData.courses.length,
    creditHoursToGraduation,
    graduationCreditRequirementMet,
    graduationEligible,
    gpa,
    onProbation,
    probationSemesters,
    probationSemestersExceeded:
      onProbation && probationSemesters >= PROBATION_MAX_SEMESTERS,
  };
}

/**
 * Format report as plain text (for download/display)
 */
export function formatReportAsText(report: AnalysisReport): string {
  const lines: string[] = [];

  lines.push("=".repeat(60));
  lines.push("ACADEMIC ADVISING REPORT");
  lines.push("CCIT - College of Computing and Information Technology");
  lines.push("=".repeat(60));
  lines.push("");
  lines.push(`Student: ${report.studentName}`);
  lines.push(`Department: ${report.department}`);
  lines.push(`Total Credit Hours: ${report.totalCreditHours}`);
  lines.push(`Expected Credit Hours (incl. pending "U" grades): ${report.expectedCreditHours}`);
  lines.push(`Completed Courses: ${report.completedCourses}`);
  if (report.latestSemester) {
    lines.push(`Latest Semester: ${report.latestSemester.label}`);
  }
  if (report.gpa !== null) {
    lines.push(`G.P.A: ${report.gpa}`);
  }
  if (report.onProbation) {
    lines.push(
      `ACADEMIC PROBATION (half-load): GPA below 2.0 — max 12 Cr./semester, ` +
        `Project I blocked, cannot graduate.` +
        (report.probationSemesters > 0
          ? ` Semester ${report.probationSemesters} of 3.`
          : "") +
        (report.probationSemestersExceeded
          ? " WARNING: probation limit of 3 semesters reached."
          : "")
    );
  }
  if (report.graduationEligible) {
    lines.push("Graduation: ELIGIBLE — all requirements met (132+ Cr.)");
  } else if (report.graduationCreditRequirementMet) {
    lines.push(
      "Graduation: 132 Cr. requirement met; requirements still outstanding"
    );
  } else {
    lines.push(
      `Graduation: ${report.creditHoursToGraduation} Cr. remaining to reach 132`
    );
  }
  lines.push("");

  // Ungraded courses
  lines.push("-".repeat(60));
  lines.push("UNGRADED SUBJECTS:");
  lines.push("-".repeat(60));
  if (report.ungradedCourses.length === 0) {
    lines.push("None");
  } else {
    report.ungradedCourses.forEach((course) => {
      lines.push(`${course.code}: ${course.title}`);
    });
  }
  lines.push("");

  // Withdrawn/Failed courses
  lines.push("-".repeat(60));
  lines.push("WITHDRAWN / FAILED COURSES:");
  lines.push("-".repeat(60));
  if (report.withdrawnFailedCourses.length === 0) {
    lines.push("None");
  } else {
    report.withdrawnFailedCourses.forEach((course) => {
      lines.push(
        `${course.code}: ${course.title} (${course.grade})` +
          (course.semester ? ` — ${course.semester.label}` : "")
      );
    });
  }
  lines.push("");

  // Recommended retakes
  lines.push("-".repeat(60));
  lines.push("RECOMMENDED RETAKES (D+ or lower, within the last year):");
  lines.push("-".repeat(60));
  if (report.retakeRecommendations.length === 0) {
    lines.push("None");
  } else {
    report.retakeRecommendations.forEach((course) => {
      lines.push(
        `${course.code}: ${course.title} (${course.grade}) — ${course.semester.label}`
      );
    });
  }
  lines.push("");

  // Available courses
  lines.push("-".repeat(60));
  lines.push("COURSES YOU CAN REGISTER:");
  lines.push("-".repeat(60));
  if (
    report.availableCourses.length === 0 &&
    report.availableMajorElectives.length === 0 &&
    report.availableScienceElectives.length === 0 &&
    report.availableUniversityRequirements.length === 0 &&
    report.availableProfessionalTraining.length === 0
  ) {
    lines.push("None available");
  } else if (report.availableCourses.length > 0) {
    lines.push("A. Recommended This Semester:");
    if (report.recommendedCourses.length === 0) {
      lines.push("  None recommended for this semester");
    } else {
      report.recommendedCourses.forEach((course) => {
        lines.push(`  ${course.code}: ${course.title}`);
      });
    }
    if (report.otherEligibleCourses.length > 0) {
      lines.push("");
      lines.push("B. Other Eligible Courses:");
      report.otherEligibleCourses.forEach((course) => {
        lines.push(`  ${course.code}: ${course.title}`);
      });
    }
  }
  if (report.availableMajorElectives.length > 0) {
    lines.push("");
    lines.push(
      `C. Major Electives (${report.remainingMajorElectives} slot(s) left):`
    );
    report.availableMajorElectives.forEach((course) => {
      lines.push(`  ${course.code}: ${course.title}`);
    });
  }
  if (report.availableProfessionalTraining.length > 0) {
    lines.push("");
    lines.push(
      `D. Professional Training (${report.remainingProfessionalTraining} slot(s) left):`
    );
    report.availableProfessionalTraining.forEach((course) => {
      lines.push(`  ${course.code ? `${course.code}: ` : ""}${course.title}`);
    });
  }
  if (report.availableScienceElectives.length > 0) {
    lines.push("");
    lines.push(
      `E. Science Electives (${report.remainingScienceElectives} slot(s) left):`
    );
    report.availableScienceElectives.forEach((course) => {
      lines.push(`  ${course.code}: ${course.title}`);
    });
  }
  if (report.availableUniversityRequirements.length > 0) {
    lines.push("");
    lines.push(
      `F. University Requirements (${report.remainingUniversityRequirements} slot(s) left):`
    );
    report.availableUniversityRequirements.forEach((course) => {
      lines.push(`  ${course.code}: ${course.title}`);
    });
  }
  lines.push("");

  // Major electives
  lines.push("-".repeat(60));
  lines.push("MAJOR ELECTIVES:");
  lines.push("-".repeat(60));
  if (report.completedMajorElectives.length === 0) {
    lines.push("No major electives registered yet");
  } else {
    lines.push("Completed:");
    report.completedMajorElectives.forEach((course) => {
      lines.push(`${course.code}: ${course.title}`);
    });
  }
  lines.push(`Remaining: ${report.remainingMajorElectives} course(s)`);
  lines.push("");

  // Science electives
  lines.push("-".repeat(60));
  lines.push("SCIENCE ELECTIVES:");
  lines.push("-".repeat(60));
  if (report.completedScienceElectives.length === 0) {
    lines.push("No science electives registered yet");
  } else {
    lines.push("Completed:");
    report.completedScienceElectives.forEach((course) => {
      lines.push(`${course.code}: ${course.title}`);
    });
  }
  lines.push(`Remaining: ${report.remainingScienceElectives} course(s)`);
  lines.push("");

  // University requirements
  lines.push("-".repeat(60));
  lines.push("UNIVERSITY REQUIREMENTS:");
  lines.push("-".repeat(60));
  if (report.completedUniversityRequirements.length === 0) {
    lines.push("No university requirements registered yet");
  } else {
    lines.push("Completed:");
    report.completedUniversityRequirements.forEach((course) => {
      lines.push(`${course.code}: ${course.title}`);
    });
  }
  lines.push(`Remaining: ${report.remainingUniversityRequirements} course(s)`);
  if (report.extraUniversityElectiveCount > 0) {
    lines.push(
      `WARNING: Only one University Elective is required, but the student registered ` +
        `${report.extraUniversityElectiveCount + 1}. The surplus adds ` +
        `${report.extraUniversityElectiveCredits} extra credit hour(s) toward no requirement — ` +
        `review with the student.`
    );
  }
  lines.push("");

  // Professional training
  lines.push("-".repeat(60));
  lines.push("PROFESSIONAL TRAINING:");
  lines.push("-".repeat(60));
  if (report.completedProfessionalTraining.length === 0) {
    lines.push("No professional training courses registered yet");
  } else {
    lines.push("Completed:");
    report.completedProfessionalTraining.forEach((course) => {
      lines.push(course);
    });
  }
  lines.push(`Remaining: ${report.remainingProfessionalTraining} course(s)`);
  lines.push("");

  // Practical Training (CIT4000)
  lines.push("-".repeat(60));
  lines.push("PRACTICAL TRAINING (CIT4000):");
  lines.push("-".repeat(60));
  if (report.practicalTrainingCompleted) {
    lines.push("Completed");
  } else if (report.practicalTrainingUngraded) {
    lines.push("Registered, grade pending");
  } else if (report.practicalTrainingEligible) {
    lines.push("Eligible to register (90+ credit hours reached)");
  } else {
    lines.push("Not yet eligible (requires 90 credit hours)");
  }
  if (report.practicalTrainingWarning) {
    lines.push(
      "WARNING: Student is near graduation (132+ credit hours) and has not completed CIT4000. Advise registering this course."
    );
  }
  lines.push("");

  // Out of plan courses
  lines.push("-".repeat(60));
  lines.push("COURSES NOT IN THE OFFICIAL PLAN:");
  lines.push("-".repeat(60));
  if (report.outOfPlanCourses.length === 0) {
    lines.push("None");
  } else {
    report.outOfPlanCourses.forEach((course) => {
      lines.push(`${course.code}: ${course.title}`);
    });
  }
  lines.push("");

  lines.push("=".repeat(60));
  lines.push("Copyright 2026 Dr. Moheeb and Eng. Hagar");
  lines.push("=".repeat(60));

  return lines.join("\n");
}
