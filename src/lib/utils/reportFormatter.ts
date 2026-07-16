/**
 * Report Formatting Utilities (Client-Safe)
 * These functions don't require server-side modules
 */

import { AnalysisReport } from "@/types";

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
