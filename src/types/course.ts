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

export interface StudiedCourse {
  code: string;
  title: string;
  grade: string;
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

export type Department = "CS" | "SE" | "IS" | "CY" | "AI" | "GM";

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
