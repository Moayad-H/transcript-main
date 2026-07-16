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
  getElectiveRequirements,
  getProfessionalTraining,
  removeElectivesInCore,
  getAvailableCourses,
  getOutOfPlanCourses,
} from "./courseAnalyzer";

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
  console.log(
    "Studied Codes (sample):",
    studiedCodes.slice(0, 5),
    "Includes CCS2304?",
    studiedCodes.includes("CCS2304")
  );

  const ungradedCourses = getUngradedCourses(transcriptData.courses);
  const withdrawnFailedCourses = getWithdrawnFailedCourses(transcriptData.courses);
  const professionalTraining = getProfessionalTraining(transcriptData.courses);

  // Calculate credit hours
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

  // Get requirements count
  const requirements = getElectiveRequirements(coursePlan);

  // Get available courses for registration
  const availableCourses = getAvailableCourses(
    coursePlan,
    studiedCodes,
    professionalTraining.length,
    transcriptData.remedialCourses,
    creditHours
  );

  console.log("Courses You Can Register:", availableCourses);

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
      lines.push(`${course.code}: ${course.title} (${course.grade})`);
    });
  }
  lines.push("");

  // Available courses
  lines.push("-".repeat(60));
  lines.push("COURSES YOU CAN REGISTER:");
  lines.push("-".repeat(60));
  if (report.availableCourses.length === 0) {
    lines.push("None available");
  } else {
    report.availableCourses.forEach((course) => {
      lines.push(`${course.code}: ${course.title}`);
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
  lines.push("Copyright 2024 Eng. Moheeb and Eng. Hagar");
  lines.push("=".repeat(60));

  return lines.join("\n");
}
