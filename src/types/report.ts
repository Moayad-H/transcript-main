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

  // Practical Training (CIT4000) — pass/fail, registerable at 90+ credit hours
  practicalTrainingCompleted: boolean;
  practicalTrainingUngraded: boolean;
  practicalTrainingEligible: boolean;
  // Achieved 132+ credit hours (near graduation) without completing CIT4000
  practicalTrainingWarning: boolean;

  // Out of plan courses
  outOfPlanCourses: StudiedCourse[];

  // Summary
  totalCreditHours: number;
  expectedCreditHours: number;
  completedCourses: number;

  // Graduation (132 credit-hour requirement)
  // Credit hours still needed to reach GRADUATION_CREDIT_HOURS (0 once met)
  creditHoursToGraduation: number;
  // Achieved credit hours meet/exceed the 132 Cr. requirement
  graduationCreditRequirementMet: boolean;
  // All graduation conditions satisfied: 132+ Cr. AND every remaining
  // requirement (electives, professional + practical training) cleared
  graduationEligible: boolean;

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
