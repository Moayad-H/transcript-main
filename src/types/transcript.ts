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
