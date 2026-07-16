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
  getElectiveRequirements,
  getProfessionalTraining,
  removeElectivesInCore,
  getAvailableCourses,
  getOutOfPlanCourses,
} from "@/lib/analysis/courseAnalyzer";

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

  const creditHours = calculateCreditHours(
    transcriptData.courses,
    professionalTraining.length
  );
  const ungradedCreditHours = calculateUngradedCreditHours(transcriptData.courses);

  // Get completed electives
  const completedMajorElectives = getCompletedElectives(
    studiedCodes,
    majorElectives
  );
  const completedScienceElectives = getCompletedElectives(
    studiedCodes,
    cleanScienceElectives
  );
  const completedUniversityElectives = getCompletedElectives(
    studiedCodes,
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
    creditHours
  );

  // Get out-of-plan courses
  const outOfPlanCourses = getOutOfPlanCourses(
    coursePlan,
    transcriptData.courses.filter((c) => !withdrawnFailedCourses.includes(c)),
    completedMajorElectives,
    completedScienceElectives,
    completedUniversityElectives
  );

  return {
    studentName,
    department,
    ungradedCourses,
    withdrawnFailedCourses,
    availableCourses,
    completedMajorElectives,
    remainingMajorElectives: Math.max(
      0,
      requirements.majorElectives - completedMajorElectives.length
    ),
    completedScienceElectives,
    remainingScienceElectives: Math.max(
      0,
      requirements.scienceElectives - completedScienceElectives.length
    ),
    completedUniversityRequirements: completedUniversityElectives,
    remainingUniversityRequirements: Math.max(
      0,
      requirements.universityRequirements - completedUniversityElectives.length
    ),
    completedProfessionalTraining: professionalTraining,
    remainingProfessionalTraining: Math.max(
      0,
      requirements.professionalTraining - professionalTraining.length
    ),
    outOfPlanCourses,
    totalCreditHours: creditHours,
    expectedCreditHours: creditHours + ungradedCreditHours,
    completedCourses: transcriptData.courses.length,
    gpa: transcriptData.gpa ?? null,
  };
}
