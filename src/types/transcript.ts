/**
 * Transcript-related types
 */

import { StudiedCourse } from "./course";
import { Department } from "./course";

export interface TranscriptData {
  studentName: string;
  studentId: string;
  department: Department;
  courses: StudiedCourse[];
  remedialCourses: string[]; // 'Precalculus' or 'Remedial English'
  gpa?: number | null; // Cumulative G.P.A as printed on the transcript
  // Best-effort count of terms whose printed GPA was below the probation
  // threshold (2.0). Heuristic — see extractProbationSemesters().
  probationSemesters?: number;
}

export interface ParsedTranscript {
  studentName?: string;
  courses: StudiedCourse[];
  remedialCourses: string[];
  totalCreditHours: number;
}

export interface TranscriptParseResult {
  success: boolean;
  data?: ParsedTranscript;
  error?: string;
}
