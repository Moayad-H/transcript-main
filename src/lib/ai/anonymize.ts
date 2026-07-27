/**
 * Strips a report down to what the AI advisor needs.
 *
 * Two jobs, both mattering:
 *
 * 1. Privacy. `AnalysisReport` carries `studentName`, and the transcript it came
 *    from carries a student ID. Neither leaves the browser — the payload built
 *    here is the only thing sent to the LLM provider, so an academic record goes
 *    out as course codes and grades with no one attached to them.
 * 2. Cost. The payload doubles as the prompt input. Every field kept is tokens
 *    spent on every generation, so this keeps codes and titles and drops the CSV
 *    plumbing (prerequisite strings, full Semester objects) the model can't use.
 *
 * Deliberately a plain function over `AnalysisReport`: it never touches
 * `TranscriptData`, so there is no path for the student ID to reach it.
 */

import { AnalysisReport } from "@/types/report";

/** A course reduced to what the model can actually reason about. */
export interface AdviceCourse {
  code: string;
  title: string;
}

export interface AdviceGradedCourse extends AdviceCourse {
  grade: string;
}

export interface AdviceRetake extends AdviceGradedCourse {
  /** Terms elapsed since that grade was earned. */
  termsAgo: number;
}

/**
 * The anonymized report sent to the advice endpoint. No name, no student ID,
 * no free-text field the caller controls.
 */
export interface AdvicePayload {
  department: string;
  gpa: number | null;
  latestSemester: string | null;

  totalCreditHours: number;
  expectedCreditHours: number;
  creditHoursToGraduation: number;

  onProbation: boolean;
  probationSemesters: number;
  probationSemestersExceeded: boolean;

  availableCourses: AdviceCourse[];
  // The rule engine's capped, plan-ordered priority list to register this term.
  recommendedCourses: AdviceCourse[];
  ungradedCourses: AdviceGradedCourse[];
  withdrawnFailedCourses: AdviceGradedCourse[];
  retakeRecommendations: AdviceRetake[];

  remainingMajorElectives: number;
  remainingScienceElectives: number;
  remainingUniversityRequirements: number;
  remainingProfessionalTraining: number;

  practicalTrainingCompleted: boolean;
  practicalTrainingEligible: boolean;
  practicalTrainingWarning: boolean;

  graduationCreditRequirementMet: boolean;
  graduationEligible: boolean;
}

/**
 * Caps on how much of each list is sent. A transcript with 60+ withdrawn
 * courses would otherwise blow up the prompt for no advising benefit — the
 * model only needs enough to spot the pattern.
 */
const MAX_AVAILABLE = 30;
const MAX_HISTORY = 20;

function toCourse({ code, title }: { code: string; title: string }): AdviceCourse {
  return { code, title };
}

function toGradedCourse({
  code,
  title,
  grade,
}: {
  code: string;
  title: string;
  grade: string;
}): AdviceGradedCourse {
  return { code, title, grade };
}

/** Builds the LLM payload from a computed report. Drops every identifier. */
export function anonymizeReport(report: AnalysisReport): AdvicePayload {
  return {
    department: report.department,
    gpa: report.gpa,
    latestSemester: report.latestSemester?.label ?? null,

    totalCreditHours: report.totalCreditHours,
    expectedCreditHours: report.expectedCreditHours,
    creditHoursToGraduation: report.creditHoursToGraduation,

    onProbation: report.onProbation,
    probationSemesters: report.probationSemesters,
    probationSemestersExceeded: report.probationSemestersExceeded,

    availableCourses: report.availableCourses.slice(0, MAX_AVAILABLE).map(toCourse),
    recommendedCourses: report.recommendedCourses.slice(0, MAX_AVAILABLE).map(toCourse),
    ungradedCourses: report.ungradedCourses.slice(0, MAX_HISTORY).map(toGradedCourse),
    withdrawnFailedCourses: report.withdrawnFailedCourses
      .slice(0, MAX_HISTORY)
      .map(toGradedCourse),
    retakeRecommendations: report.retakeRecommendations
      .slice(0, MAX_HISTORY)
      .map((retake) => ({
        code: retake.code,
        title: retake.title,
        grade: retake.grade,
        termsAgo: retake.termsAgo,
      })),

    remainingMajorElectives: report.remainingMajorElectives,
    remainingScienceElectives: report.remainingScienceElectives,
    remainingUniversityRequirements: report.remainingUniversityRequirements,
    remainingProfessionalTraining: report.remainingProfessionalTraining,

    practicalTrainingCompleted: report.practicalTrainingCompleted,
    practicalTrainingEligible: report.practicalTrainingEligible,
    practicalTrainingWarning: report.practicalTrainingWarning,

    graduationCreditRequirementMet: report.graduationCreditRequirementMet,
    graduationEligible: report.graduationEligible,
  };
}
