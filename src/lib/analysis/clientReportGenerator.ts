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
  getOutOfPlanCourses,
} from "@/lib/analysis/courseAnalyzer";
import {
  PRACTICAL_TRAINING_MIN_CREDIT_HOURS,
  GRADUATION_CREDIT_HOURS,
  PROBATION_GPA_THRESHOLD,
  PROBATION_MAX_SEMESTERS,
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
  const gpa = transcriptData.gpa ?? null;
  const onProbation = gpa !== null && gpa < PROBATION_GPA_THRESHOLD;
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
    gpa
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
  const remainingScienceElectives = Math.max(
    0,
    requirements.scienceElectives - completedScienceElectives.length
  );
  const remainingUniversityRequirements = Math.max(
    0,
    requirements.universityRequirements - completedUniversityElectives.length
  );
  const remainingProfessionalTraining = Math.max(
    0,
    requirements.professionalTraining - professionalTraining.length
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
  const gpaMeetsGraduation = gpa === null || gpa >= PROBATION_GPA_THRESHOLD;
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
    completedMajorElectives,
    ungradedMajorElectives,
    remainingMajorElectives,
    completedScienceElectives,
    ungradedScienceElectives,
    remainingScienceElectives,
    completedUniversityRequirements: completedUniversityElectives,
    ungradedUniversityRequirements: ungradedUniversityElectives,
    remainingUniversityRequirements,
    completedProfessionalTraining: professionalTraining,
    remainingProfessionalTraining,
    practicalTrainingCompleted: practicalTraining.completed,
    practicalTrainingUngraded: practicalTraining.ungraded,
    practicalTrainingEligible: creditHours >= PRACTICAL_TRAINING_MIN_CREDIT_HOURS,
    practicalTrainingWarning:
      creditHours >= GRADUATION_CREDIT_HOURS && !practicalTraining.completed,
    outOfPlanCourses,
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
