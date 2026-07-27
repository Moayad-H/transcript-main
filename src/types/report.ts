/**
 * Report generation types
 */

import { StudiedCourse, Course, ElectiveCourse, Semester } from "./course";

export interface ReportSection {
  title: string;
  content: string[];
}

/**
 * A course the student should be advised to repeat: passed with a weak grade
 * (D+ and under) recently enough to still be inside the retake window.
 */
export interface RetakeRecommendation {
  code: string;
  title: string;
  /** The weak grade on record (D+, D or D-). */
  grade: string;
  /** The semester that grade was earned in. */
  semester: Semester;
  /** Terms elapsed between that semester and the transcript's latest semester. */
  termsAgo: number;
}

export interface AnalysisReport {
  studentName: string;
  department: string;

  // Ungraded courses
  ungradedCourses: StudiedCourse[];

  // Withdrawn or Failed courses
  withdrawnFailedCourses: StudiedCourse[];

  // Available courses for registration (full eligible pool)
  availableCourses: Course[];
  // Priority list to register this semester (group A), a capped subset of availableCourses
  recommendedCourses: Course[];
  // Remaining eligible courses that aren't the priority this semester (group B)
  otherEligibleCourses: Course[];

  // Major electives
  completedMajorElectives: ElectiveCourse[];
  // Registered but not-yet-graded (U) electives filling a category slot
  ungradedMajorElectives: ElectiveCourse[];
  remainingMajorElectives: number;
  // Concrete major-elective courses the student can register now (prereqs met,
  // not yet taken) — only while a major-elective slot remains open. Empty once
  // all slots are filled. Drives section C of "Courses You Can Register".
  availableMajorElectives: Course[];

  // Science electives
  completedScienceElectives: ElectiveCourse[];
  ungradedScienceElectives: ElectiveCourse[];
  remainingScienceElectives: number;

  // University requirements
  completedUniversityRequirements: ElectiveCourse[];
  ungradedUniversityRequirements: ElectiveCourse[];
  remainingUniversityRequirements: number;

  // Professional training
  completedProfessionalTraining: string[];
  remainingProfessionalTraining: number;
  // The next Professional Training course to register (the slot due this
  // semester in the fixed Sem 5–8 sequence) — only from year 3 while a slot
  // remains. Empty once all four are done. Drives section D of "Courses You
  // Can Register".
  availableProfessionalTraining: Course[];

  // Practical Training (CIT4000) — pass/fail, registerable at 90+ credit hours
  practicalTrainingCompleted: boolean;
  practicalTrainingUngraded: boolean;
  practicalTrainingEligible: boolean;
  // Achieved 132+ credit hours (near graduation) without completing CIT4000
  practicalTrainingWarning: boolean;

  // Out of plan courses
  outOfPlanCourses: StudiedCourse[];

  // The most recent semester on the transcript — the anchor the retake window
  // is measured back from. Null when no semester could be read.
  latestSemester: Semester | null;
  // Courses passed with a weak grade (D+ and under) recently enough to be worth
  // repeating (see RETAKE_WINDOW_TERMS), most recent first.
  retakeRecommendations: RetakeRecommendation[];

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

  // Academic probation ("half-load"): the student's known cumulative GPA is
  // below 2.0. While true, registration is capped at 12 Cr, Project I is
  // blocked, and graduation is not allowed.
  onProbation: boolean;
  // Best-effort count of semesters the student has spent on probation (terms
  // whose printed GPA was below 2.0). 0 when unknown/unparseable.
  probationSemesters: number;
  // The student has been on probation for the maximum allowed number of
  // semesters (3) — flags dismissal risk in the UI.
  probationSemestersExceeded: boolean;
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
