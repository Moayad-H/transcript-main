/**
 * Report generation types
 */

import { StudiedCourse, Course, ElectiveCourse } from "./course";

export interface ReportSection {
  title: string;
  content: string[];
}

export interface AnalysisReport {
  studentName: string;
  department: string;

  // Ungraded courses
  ungradedCourses: StudiedCourse[];

  // Withdrawn or Failed courses
  withdrawnFailedCourses: StudiedCourse[];

  // Available courses for registration
  availableCourses: Course[];

  // Major electives
  completedMajorElectives: ElectiveCourse[];
  remainingMajorElectives: number;

  // Science electives
  completedScienceElectives: ElectiveCourse[];
  remainingScienceElectives: number;

  // University requirements
  completedUniversityRequirements: ElectiveCourse[];
  remainingUniversityRequirements: number;

  // Professional training
  completedProfessionalTraining: string[];
  remainingProfessionalTraining: number;

  // Out of plan courses
  outOfPlanCourses: StudiedCourse[];

  // Summary
  totalCreditHours: number;
  expectedCreditHours: number;
  completedCourses: number;

  // Cumulative G.P.A as printed on the transcript (null if not found)
  gpa: number | null;
}

export interface ReportGenerationRequest {
  studentName: string;
  department: string;
  transcriptData: TranscriptData;
}

export interface ReportGenerationResponse {
  success: boolean;
  report?: AnalysisReport;
  error?: string;
}

interface TranscriptData {
  courses: StudiedCourse[];
  remedialCourses: string[];
}
