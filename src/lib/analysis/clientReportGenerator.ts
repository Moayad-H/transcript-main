/**
 * Client-side Report Generator
 */

import { AnalysisReport, TranscriptData, Department } from "@/types";
import { loadDepartmentData } from "@/lib/data/clientCsvLoader";
import {
  getStudiedCourseCodes,
  getUngradedCourses,
  calculateCreditHours,
  calculateUngradedCreditHours,
  getWithdrawnFailedCourses,
} from "@/lib/analysis/clientParser";
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
} from "@/lib/analysis/courseAnalyzer";
import { loadPlanSemesters } from "@/lib/analysis/courseGraphBuilder";
import {
  getLatestSemester,
  getRetakeRecommendations,
} from "@/lib/analysis/semester";
import {
  PRACTICAL_TRAINING_MIN_CREDIT_HOURS,
  GRADUATION_CREDIT_HOURS,
  PROBATION_GPA_THRESHOLD,
  PROBATION_MAX_SEMESTERS,
  TWO_CREDIT_HOURS,
} from "@/lib/constants";

/**
 * Generate report on the client side
 */
export async function generateReportClient(
  studentName: string,
  department: Department,
  transcriptData: TranscriptData
): Promise<AnalysisReport> {
  // Load department data from public folder
  const {
    courses: coursePlan,
    majorElectives,
    scienceElectives,
    universityElectives,
  } = await loadDepartmentData(department);

  // Remove electives in core
  const cleanScienceElectives = removeElectivesInCore(
    coursePlan,
    scienceElectives
  );
  const cleanUniversityElectives = removeElectivesInCore(
    coursePlan,
    universityElectives
  );

  // Extract course data
  const studiedCodes = getStudiedCourseCodes(transcriptData.courses);
  const ungradedCourses = getUngradedCourses(transcriptData.courses);
  const withdrawnFailedCourses = getWithdrawnFailedCourses(transcriptData.courses);
  const professionalTraining = getProfessionalTraining(transcriptData.courses);
  const practicalTraining = getPracticalTrainingStatus(transcriptData.courses);

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

  // Get requirements
  const requirements = getElectiveRequirements(coursePlan);

  // Get available courses
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
  // list (group A) and the remaining eligible courses (group B). Manual-entry
  // transcripts still resolve the plan file, so the plan ranking applies.
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
    transcriptData.courses.filter((c) => !withdrawnFailedCourses.includes(c)),
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
