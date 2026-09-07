"use client";

import React from "react";
import { AnalysisReport, TranscriptData, Semester, Department } from "@/types";
import {
  ManualPlannerResult,
  PlannerCourse,
  EvaluatedTerm,
  EvaluatedEntry,
} from "@/lib/analysis/semesterPlanner";
import {
  DEPARTMENT_NAMES,
  GRADUATION_CREDIT_HOURS,
  GRADES,
  isTwoCreditCourse,
} from "@/lib/constants";

export interface InProgressSemesterGroup {
  semester: Semester;
  courses: { code: string; title: string; grade: string }[];
}

interface PrintableSemesterPlanProps {
  report: AnalysisReport;
  transcriptData: TranscriptData;
  plan: ManualPlannerResult;
  plannerCourses: PlannerCourse[];
  plannerCourseById: Map<string, PlannerCourse>;
  planTermLabels: string[];
  inProgressSemesters: InProgressSemesterGroup[];
  projGrades: Map<string, string>;
  ungradedNodeByCode: Map<string, string>;
}

const UNGRADED_GRADES = new Set<string>([...GRADES.UNGRADED]);

function creditValueForCode(code: string): number {
  return isTwoCreditCourse(code) ? 2 : 3;
}

export function PrintableSemesterPlan({
  report,
  transcriptData,
  plan,
  plannerCourseById,
  planTermLabels,
  inProgressSemesters,
  projGrades,
  ungradedNodeByCode,
}: PrintableSemesterPlanProps) {
  const currentDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const departmentName =
    DEPARTMENT_NAMES[report.department as Department] || report.department;

  const totalPlannedRegular = plan.terms.filter((t: EvaluatedTerm) => !t.isSummer).length;
  const totalPlannedSummer = plan.terms.filter((t: EvaluatedTerm) => t.isSummer).length;

  return (
    <div className="semester-plan-print-sheet text-slate-900 bg-white p-6 print:p-2 text-xs leading-normal">
      {/* 1. Institutional Document Header */}
      <div className="border-b-2 border-slate-900 pb-3 mb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[11px] font-bold tracking-wider uppercase text-slate-600">
              Arab Academy for Science, Technology & Maritime Transport
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-950 uppercase">
              College of Computing & Information Technology
            </h1>
            <div className="text-sm font-bold text-sky-850 mt-0.5 tracking-wide">
              Official Student Semester Study & Graduation Plan
            </div>
          </div>
          <div className="text-right shrink-0">
            <span className="inline-block rounded border border-slate-300 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              Academic Advising Record
            </span>
            <div className="text-[10px] text-slate-500 mt-1">
              Issued: <strong>{currentDate}</strong>
            </div>
          </div>
        </div>

        {/* Student Identification & Status Grid */}
        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 bg-slate-50 border border-slate-200 rounded-lg p-2.5 print:bg-slate-50">
          <div>
            <div className="text-[9px] uppercase font-bold text-slate-500">Student Name</div>
            <div className="text-sm font-bold text-slate-900 truncate">
              {report.studentName || transcriptData.studentName}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase font-bold text-slate-500">Student ID</div>
            <div className="text-sm font-mono font-bold text-slate-900">
              {report.studentID || transcriptData.studentId}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase font-bold text-slate-500">Department / Major</div>
            <div className="text-xs font-bold text-slate-900 truncate">
              {report.department} — {departmentName}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase font-bold text-slate-500">Academic Standing</div>
            <div>
              {report.onProbation ? (
                <span className="inline-block font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.2 rounded text-[11px]">
                  Academic Probation (12 Cr. Cap)
                </span>
              ) : (
                <span className="inline-block font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded text-[11px]">
                  Good Standing
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Executive Academic Summary Bar */}
      <div className="grid grid-cols-5 gap-2 mb-4">
        <div className="border border-slate-200 bg-white rounded-lg p-2 text-center shadow-2xs">
          <div className="text-[9px] uppercase font-bold text-slate-500">Current Earned</div>
          <div className="text-sm font-extrabold text-slate-900">
            {report.totalCreditHours}{" "}
            <span className="text-[10px] font-normal text-slate-500">/ {GRADUATION_CREDIT_HOURS} Cr</span>
          </div>
        </div>
        <div className="border border-slate-200 bg-white rounded-lg p-2 text-center shadow-2xs">
          <div className="text-[9px] uppercase font-bold text-slate-500">Current GPA</div>
          <div className={`text-sm font-extrabold ${report.onProbation ? "text-rose-600" : "text-slate-900"}`}>
            {report.gpa !== null ? report.gpa.toFixed(2) : "—"}
          </div>
        </div>
        <div className="border border-sky-200 bg-sky-50/50 rounded-lg p-2 text-center shadow-2xs">
          <div className="text-[9px] uppercase font-bold text-sky-800">Planned Terms</div>
          <div className="text-sm font-extrabold text-sky-900">
            {plan.terms.length}{" "}
            <span className="text-[10px] font-normal text-sky-700">
              ({totalPlannedRegular} Reg{totalPlannedSummer > 0 ? ` + ${totalPlannedSummer} Sum` : ""})
            </span>
          </div>
        </div>
        <div className="border border-sky-200 bg-sky-50/50 rounded-lg p-2 text-center shadow-2xs">
          <div className="text-[9px] uppercase font-bold text-sky-800">Projected Total Credits</div>
          <div className="text-sm font-extrabold text-sky-900">
            {plan.finalEarnedCredits}{" "}
            <span className="text-[10px] font-normal text-sky-700">/ {GRADUATION_CREDIT_HOURS} Cr</span>
          </div>
        </div>
        <div className="border border-emerald-200 bg-emerald-50/50 rounded-lg p-2 text-center shadow-2xs">
          <div className="text-[9px] uppercase font-bold text-emerald-800">
            {plan.unplaced.length === 0 ? "Graduation GPA" : "Projected GPA"}
          </div>
          <div className="text-sm font-extrabold text-emerald-900">
            {plan.finalGpa !== null ? plan.finalGpa.toFixed(3) : "—"}
          </div>
        </div>
      </div>

      {/* 3. In-Progress Semester (Current Semester Baseline) */}
      {inProgressSemesters.length > 0 && (
        <div className="mb-4 border border-amber-300 rounded-lg bg-amber-50/30 p-2.5 break-inside-avoid">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-amber-200">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-amber-950 uppercase tracking-wide">
                Current Semester (In Progress) — {inProgressSemesters[0].semester.label}
              </span>
              <span className="text-[10px] font-semibold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                Baseline for Future Plan
              </span>
            </div>
            <span className="text-[10px] font-bold text-amber-900">
              {inProgressSemesters[0].courses.reduce(
                (sum: number, c: { code: string; title: string; grade: string }) =>
                  sum + creditValueForCode(c.code),
                0
              )}{" "}
              Cr
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {inProgressSemesters[0].courses.map(
              (c: { code: string; title: string; grade: string }, ci: number) => {
                const isUngraded = UNGRADED_GRADES.has(c.grade);
                const nodeId = isUngraded
                  ? ungradedNodeByCode.get(c.code.toUpperCase().replace(/\s+/g, ""))
                  : undefined;
                const projectedGrade = nodeId ? projGrades.get(nodeId) : undefined;
                const displayGrade = projectedGrade || (isUngraded ? "In Progress (U)" : c.grade);

                return (
                  <div
                    key={`${c.code}-${ci}`}
                    className="flex items-center justify-between gap-1.5 bg-white border border-amber-200 rounded px-2 py-1 text-[11px]"
                  >
                    <div className="min-w-0">
                      <span className="font-mono font-bold text-amber-950 mr-1.5">{c.code}</span>
                      <span className="text-slate-700 truncate">{c.title}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-slate-500 font-medium">
                        {creditValueForCode(c.code)}cr
                      </span>
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${
                          projectedGrade
                            ? "bg-sky-50 text-sky-800 border-sky-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}
                      >
                        {displayGrade}
                      </span>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      )}

      {/* 4. Planned Future Semesters Breakdown */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Planned Semester Schedule ({plan.terms.length} Terms)
          </h2>
          {plan.unplaced.length === 0 ? (
            <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
              ✓ Full 132 Cr Degree Path Completed
            </span>
          ) : (
            <span className="text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
              {plan.unplaced.length} Requirement(s) Remaining
            </span>
          )}
        </div>

        {plan.terms.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-slate-300 rounded-lg text-slate-500">
            No future semesters planned yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {plan.terms.map((term: EvaluatedTerm, ti: number) => {
              const label = planTermLabels[ti] || `Planned Semester ${ti + 1}`;
              const cumulativeCredits =
                ti + 1 < plan.terms.length
                  ? plan.terms[ti + 1].earnedAtStart
                  : plan.finalEarnedCredits;

              const overCeiling = term.load > term.ceiling;
              const overNormal = term.load > term.cap && !overCeiling;

              return (
                <div
                  key={`print-term-${term.index}`}
                  className={`border rounded-lg p-2.5 break-inside-avoid bg-white ${
                    term.isSummer
                      ? "border-amber-300 bg-amber-50/10"
                      : "border-slate-300"
                  }`}
                >
                  {/* Term Header */}
                  <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-200">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-xs text-slate-900">
                        {label}
                      </span>
                      {term.isSummer && (
                        <span className="text-[9px] font-bold text-amber-800 bg-amber-100 border border-amber-300 px-1 py-0.2 rounded">
                          ☀️ Summer
                        </span>
                      )}
                      {term.overload && (
                        <span className="text-[9px] font-bold text-indigo-800 bg-indigo-100 border border-indigo-300 px-1 py-0.2 rounded">
                          Overload (21 Cr)
                        </span>
                      )}
                      {term.probation && (
                        <span className="text-[9px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-1 py-0.2 rounded">
                          Half-Load (12 Cr)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span
                        className={`font-bold px-1.5 py-0.5 rounded border ${
                          overCeiling
                            ? "bg-rose-50 text-rose-700 border-rose-300"
                            : overNormal
                            ? "bg-amber-50 text-amber-800 border-amber-300"
                            : "bg-slate-100 text-slate-800 border-slate-200"
                        }`}
                      >
                        Load: {term.load} / {term.ceiling} Cr
                      </span>
                    </div>
                  </div>

                  {/* Term Summary Micro-row */}
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-2 px-1">
                    <span>
                      Cumulative Credits: <strong>{cumulativeCredits} / {GRADUATION_CREDIT_HOURS} Cr</strong>
                    </span>
                    {term.gpaAtStart !== null && (
                      <span>
                        Start GPA: <strong>{term.gpaAtStart.toFixed(2)}</strong>
                      </span>
                    )}
                  </div>

                  {/* Courses Table */}
                  {term.entries.length === 0 ? (
                    <div className="py-3 text-center text-slate-400 text-[10px] italic">
                      No courses placed in this semester.
                    </div>
                  ) : (
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[9px] uppercase font-bold text-slate-500 text-left">
                          <th className="py-1 px-1 font-bold">Code</th>
                          <th className="py-1 px-1 font-bold">Course Title</th>
                          <th className="py-1 px-1 font-bold text-center">Cr</th>
                          <th className="py-1 px-1 font-bold text-center">Proj. Grade</th>
                          <th className="py-1 px-1 font-bold text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {term.entries.map((entry: EvaluatedEntry) => {
                          const c = plannerCourseById.get(entry.id);
                          if (!c) return null;
                          const isPassFail = c.gpaCredit === 0;

                          return (
                            <tr
                              key={entry.id}
                              className={!entry.valid ? "bg-rose-50/60" : "hover:bg-slate-50/50"}
                            >
                              <td className="py-1 px-1 font-mono font-bold text-slate-900 whitespace-nowrap">
                                {c.code}
                              </td>
                              <td className="py-1 px-1 text-slate-800">
                                <div className="truncate max-w-[190px]" title={c.title}>
                                  {c.title}
                                </div>
                                {!entry.valid && entry.reason && (
                                  <div className="text-[9px] text-rose-600 font-medium">
                                    ⚠ {entry.reason}
                                  </div>
                                )}
                              </td>
                              <td className="py-1 px-1 text-center text-slate-600 font-semibold">
                                {c.loadCredit}
                              </td>
                              <td className="py-1 px-1 text-center font-bold">
                                {isPassFail ? (
                                  <span className="text-[9px] font-medium text-slate-500 bg-slate-100 px-1 py-0.2 rounded">
                                    P/F
                                  </span>
                                ) : (
                                  <span className="text-slate-900 bg-slate-50 border border-slate-200 px-1.5 py-0.2 rounded font-mono">
                                    {entry.grade}
                                  </span>
                                )}
                              </td>
                              <td className="py-1 px-1 text-right">
                                {entry.valid ? (
                                  <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                                    Eligible
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-rose-700 bg-rose-50 px-1 py-0.2 rounded border border-rose-200">
                                    Prereq Unmet
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Remaining Unplaced Requirements (if any) */}
      {plan.unplaced.length > 0 && (
        <div className="mb-4 border border-slate-300 rounded-lg p-2.5 bg-slate-50 break-inside-avoid">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
              Requirements Remaining for Degree Completion ({plan.unplaced.length} Courses)
            </span>
            <span className="text-[10px] font-bold text-slate-600">
              {plan.unplaced.reduce((sum: number, c: PlannerCourse) => sum + c.loadCredit, 0)} Cr to place
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {plan.unplaced.map((c: PlannerCourse) => (
              <span
                key={c.id}
                className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded px-2 py-0.5 text-[10px] text-slate-800"
              >
                <strong className="font-mono">{c.code}</strong>
                <span className="text-slate-500">({c.loadCredit} cr)</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 6. Official Academic Advising Disclaimer & Formal Sign-off */}
      <div className="mt-4 pt-3 border-t-2 border-slate-900 break-inside-avoid">
        <p className="text-[9px] text-slate-500 italic mb-4 leading-relaxed">
          * Notice: This Semester Study Plan is an advising roadmap designed in consultation with the student’s CCIT
          Academic Advisor. Registration in future semesters remains subject to department course schedules, section
          capacity, prerequisite verification, and adherence to university academic standing policies.
        </p>

        <div className="grid grid-cols-2 gap-8 pt-2">
          <div>
            <div className="border-b border-slate-400 pb-6 mb-1">
              <span className="text-[10px] uppercase font-bold text-slate-500">Student Signature</span>
            </div>
            <div className="flex items-center justify-between text-[9px] text-slate-600">
              <span>{report.studentName || transcriptData.studentName}</span>
              <span>Date: ____________________</span>
            </div>
          </div>

          <div>
            <div className="border-b border-slate-400 pb-6 mb-1">
              <span className="text-[10px] uppercase font-bold text-slate-500">Academic Advisor Signature</span>
            </div>
            <div className="flex items-center justify-between text-[9px] text-slate-600">
              <span>CCIT Academic Advising Office</span>
              <span>Date: ____________________</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
