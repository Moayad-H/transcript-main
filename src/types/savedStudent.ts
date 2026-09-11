import { Department } from "./course";
import { TranscriptData } from "./transcript";

export interface SavedStudentRecord {
  id?: string;
  staffId: string;
  studentId: string;
  studentName: string;
  department: Department;
  gpa: number;
  totalCreditHours: number;
  onProbation: boolean;
  failedCoursesCount: number;
  transcriptData: TranscriptData;
  createdAt: string;
  updatedAt: string;
}

export type SavedStudentSummary = Omit<SavedStudentRecord, "transcriptData">;

export interface SavedStudentFilterOptions {
  searchQuery: string;
  department: Department | "ALL";
  standing: "ALL" | "PROBATION" | "FAILED_COURSES" | "GOOD_STANDING";
  sortBy: "UPDATED_DESC" | "NAME_ASC" | "GPA_DESC" | "GPA_ASC" | "CREDITS_DESC";
}
