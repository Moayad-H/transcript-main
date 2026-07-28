/**
 * Core course types for the ERSHAD2 application
 */

export interface Course {
  code: string;
  title: string;
  prerequisiteCode: string;
  prerequisiteTitle?: string;
}

export interface CourseWithGrade extends Course {
  grade: string;
}

/**
 * An academic term as printed on the transcript, e.g.
 * "First Semester / 2024-2025".
 */
export type SemesterTerm = "First" | "Second" | "Summer";

export interface Semester {
  term: SemesterTerm;
  /** Calendar year the academic year starts in (2024 for "2024-2025"). */
  startYear: number;
  /** Calendar year the academic year ends in (2025 for "2024-2025"). */
  endYear: number;
  /** Canonical label, e.g. "First Semester / 2024-2025". */
  label: string;
}

export interface StudiedCourse {
  code: string;
  title: string;
  grade: string;
  /**
   * The academic term the course was taken in, read off the transcript's
   * semester headers. Undefined when the transcript layout couldn't be
   * resolved or for manually entered courses.
   */
  semester?: Semester;
}

export interface ElectiveCourse {
  code: string;
  title: string;
  prerequisiteCode: string;
}

export interface CoursePlan {
  courses: Course[];
  majorElectives: ElectiveCourse[];
  scienceElectives: ElectiveCourse[];
  universityElectives: ElectiveCourse[];
}

export type Department = "CS" | "SE" | "IS" | "CY" | "AI" | "GM" | "PSCS";

export type Grade =
  | "A+"
  | "A"
  | "A-"
  | "B+"
  | "B"
  | "B-"
  | "C+"
  | "C"
  | "C-"
  | "D+"
  | "D"
  | "D-"
  | "F"
  | "W"
  | "U"
  | "P"
  | "Tr";

export interface CourseRequirement {
  professionalTraining: number;
  scienceElectives: number;
  majorElectives: number;
  universityRequirements: number;
}
