import fs from "fs";
import path from "path";
import { findSchedules } from "../src/lib/analysis/scheduleFinder";
import { GroupSchedule } from "../src/types/schedule";

const schedulesPath = path.join(__dirname, "../public/data/schedules/default_schedules.json");
const schedules: GroupSchedule[] = JSON.parse(fs.readFileSync(schedulesPath, "utf8"));

console.log(`Loaded ${schedules.length} schedule groups`);

// Scenario 1: Student in CS recommending Semester 3 courses + an off-semester course from Semester 2 (EBA1204)
const targetCourses1 = [
  { code: "CCS2303", title: "Object Oriented Programming" },
  { code: "CCS2102", title: "Digital Logic Design" },
  { code: "CCS2201", title: "Introduction to Networks" },
  { code: "CIS2101", title: "Database Systems" },
  { code: "EBA1204", title: "Calculus II" }, // Term 2 course!
];

console.log("\n=== Testing Scenario 1: CS student needing 4 Term-3 courses + 1 Term-2 course (EBA1204) ===");
const solutions1 = findSchedules({
  studentDepartment: "CS",
  targetCourses: targetCourses1,
  allGroups: schedules,
});

console.log(`Generated ${solutions1.length} candidate solutions`);
const best = solutions1[0];
console.log(`Top Solution: Base Group = ${best.baseGroup}`);
console.log(`  Covered in Base Group: ${best.coveredInBaseCount}/${best.totalCoursesCount}`);
console.log(`  Has Conflicts: ${best.hasConflicts}`);
if (best.hasConflicts) {
  console.log(`  Conflicting Courses:`, best.conflictCourses);
}
console.log("  Course Assignments:");
for (const as of best.assignments) {
  const altTag = as.isAlternativeGroup ? `[ALT: ${as.assignedGroup}, Term ${as.targetTerm}]` : `[BASE: ${as.assignedGroup}]`;
  const conflictTag = as.conflictWith ? `CONFLICT WITH ${as.conflictWith.join(", ")}` : "OK";
  console.log(`    - ${as.courseCode}: ${altTag} (Slots: ${as.slots.length}) -> ${conflictTag}`);
}

// Check if EBA1204 was assigned to a Term 2 group (2CS1, 2CS2, or 2CS3)
const ebaAssignment = best.assignments.find((a) => a.courseCode === "EBA1204");
if (ebaAssignment && ebaAssignment.assignedGroup.startsWith("2CS")) {
  console.log(`\nSUCCESS: EBA1204 correctly mapped to Term 2 group ${ebaAssignment.assignedGroup}!`);
} else {
  console.log(`\nFAILURE: EBA1204 assigned to ${ebaAssignment?.assignedGroup}`);
}

console.log("\n=== Testing Scenario 2: SE student needing Term-5 SE courses ===");
const targetCourses2 = [
  { code: "CSE3101", title: "Software Requirements and Specifications" },
  { code: "CSE3402", title: "Project Management" },
  { code: "EBA3202", title: "Differential Equations" },
  { code: "CAI3101", title: "Introduction to Artificial Intelligence" },
  { code: "CCS3203", title: "Operating Systems" },
  { code: "CIT3200", title: "Professional Training in Mobile Apps Programming" },
];

const solutions2 = findSchedules({
  studentDepartment: "SE",
  targetCourses: targetCourses2,
  allGroups: schedules,
});

console.log(`Generated ${solutions2.length} candidate solutions for SE`);
const bestSE = solutions2[0];
console.log(`Top Solution: Base Group = ${bestSE.baseGroup}`);
console.log(`  Covered in Base Group: ${bestSE.coveredInBaseCount}/${bestSE.totalCoursesCount}`);
console.log(`  Has Conflicts: ${bestSE.hasConflicts}`);
for (const as of bestSE.assignments) {
  console.log(`    - ${as.courseCode}: [${as.assignedGroup}] (Slots: ${as.slots.length})`);
}

