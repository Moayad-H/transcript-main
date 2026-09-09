/**
 * Timetable & Schedule Types
 */

export type DayOfWeek = "Sa" | "Su" | "Mo" | "Tu" | "We" | "Th";

export type PeriodNumber = 1 | 2 | 3 | 4 | 5 | 6;

export interface PeriodDefinition {
  period: PeriodNumber;
  label: string;
  timeRange: string;
}

export const SCHEDULE_PERIODS: readonly PeriodDefinition[] = [
  { period: 1, label: "1", timeRange: "8:30 - 10:10" },
  { period: 2, label: "2", timeRange: "10:30 - 12:10" },
  { period: 3, label: "3", timeRange: "12:30 - 14:10" },
  { period: 4, label: "4", timeRange: "14:30 - 16:10" },
  { period: 5, label: "5", timeRange: "16:30 - 18:10" },
  { period: 6, label: "6", timeRange: "18:30 - 20:10" },
] as const;

export const SCHEDULE_DAYS: readonly { day: DayOfWeek; label: string; full: string }[] = [
  { day: "Sa", label: "Sa", full: "Saturday" },
  { day: "Su", label: "Su", full: "Sunday" },
  { day: "Mo", label: "Mo", full: "Monday" },
  { day: "Tu", label: "Tu", full: "Tuesday" },
  { day: "We", label: "We", full: "Wednesday" },
  { day: "Th", label: "Th", full: "Thursday" },
] as const;

export interface ScheduleSlot {
  day: DayOfWeek;
  period: PeriodNumber;
}

export interface CourseInGroup {
  code: string;
  title: string;
  slots: ScheduleSlot[];
}

export interface GroupSchedule {
  groupName: string; // e.g. "2CS1", "3CS2", "5SE4", "8IS1"
  semester: number; // Term number e.g. 2, 3, 5, 8
  department: string; // "CS", "SE", "CY", "AI", "IS", etc.
  subGroup?: string; // e.g. "Science", "1", "2"
  courses: CourseInGroup[];
}

export interface CandidateGroupOption {
  groupName: string;
  slots: ScheduleSlot[];
  hasConflict: boolean;
  conflictingCourses?: string[];
}

export interface CourseAssignment {
  courseCode: string;
  courseTitle: string;
  assignedGroup: string;
  isAlternativeGroup: boolean;
  targetTerm?: number;
  slots: ScheduleSlot[];
  conflictWith?: string[];
  candidateGroups: CandidateGroupOption[];
}

export interface ScheduleSolution {
  id: string;
  baseGroup: string;
  semester: number;
  department: string;
  coveredInBaseCount: number;
  totalCoursesCount: number;
  assignments: CourseAssignment[];
  hasConflicts: boolean;
  conflictCourses: string[];
}
