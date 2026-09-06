"use client";

import React, { useMemo } from "react";
import { BatchStudentResult } from "@/lib/utils/batchTranscriptProcessor";
import { DEPARTMENT_NAMES } from "@/lib/constants";
import { CourseStatus, GraphCourseNode } from "@/lib/analysis/courseGraphBuilder";

interface PrintableStudentGraphProps {
  student: BatchStudentResult;
  index: number;
  totalStudents: number;
  onViewReport?: (student: BatchStudentResult) => void;
  onPrintStudent?: (student: BatchStudentResult) => void;
}

const STATUS_COLOR_MAP: Record<
  CourseStatus,
  {
    card: string;
    badge: string;
    border: string;
    label: string;
    printText: string;
  }
> = {
  completed: {
    card: "bg-emerald-50 border-emerald-500 text-emerald-950",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-300",
    border: "border-emerald-500",
    label: "Completed",
    printText: "text-emerald-800",
  },
  ungraded: {
    card: "bg-amber-50 border-amber-500 text-amber-950",
    badge: "bg-amber-100 text-amber-800 border-amber-300",
    border: "border-amber-500",
    label: "In Progress (U)",
    printText: "text-amber-800",
  },
  available: {
    card: "bg-blue-50 border-blue-500 text-blue-950",
    badge: "bg-blue-100 text-blue-800 border-blue-300",
    border: "border-blue-500",
    label: "Available to Register",
    printText: "text-blue-800",
  },
  blocked: {
    card: "bg-slate-50/80 border-slate-300 text-slate-500",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
    border: "border-slate-300",
    label: "Prereqs Unmet",
    printText: "text-slate-500",
  },
  failed: {
    card: "bg-rose-50 border-rose-500 text-rose-950",
    badge: "bg-rose-100 text-rose-800 border-rose-300",
    border: "border-rose-500",
    label: "Failed / Withdrawn",
    printText: "text-rose-800",
  },
  elective: {
    card: "bg-purple-50 border-purple-400 text-purple-950 border-dashed",
    badge: "bg-purple-100 text-purple-800 border-purple-300",
    border: "border-purple-400",
    label: "Elective Slot",
    printText: "text-purple-800",
  },
};

export function PrintableStudentGraph({
  student,
  index,
  totalStudents,
  onViewReport,
  onPrintStudent,
}: PrintableStudentGraphProps) {
  const { report, graph } = student;

  // Group nodes by columns according to graph.columns
  const columnsData = useMemo(() => {
    if (!graph || !graph.columns || graph.columns.length === 0) {
      return [];
    }

    const colMap = new Map<number, { label: string; nodes: GraphCourseNode[] }>();
    for (const col of graph.columns) {
      colMap.set(col.x, { label: col.label, nodes: [] });
    }

    for (const node of graph.nodes) {
      const col = colMap.get(node.position.x);
      if (col) {
        col.nodes.push(node);
      } else {
        // Fallback to nearest column or first
        const firstCol = colMap.values().next().value;
        if (firstCol) firstCol.nodes.push(node);
      }
    }

    // Sort nodes vertically in each column by y position
    for (const col of colMap.values()) {
      col.nodes.sort((a, b) => a.position.y - b.position.y);
    }

    return Array.from(colMap.entries())
      .sort(([x1], [x2]) => x1 - x2)
      .map(([x, data]) => ({ x, ...data }));
  }, [graph]);

  return (
    <div
      id={`student-sheet-${student.id}`}
      className="student-print-sheet relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:m-0 print:rounded-none print:border-none print:p-2 print:shadow-none print:break-after-page mb-8"
    >
      {/* Top Banner / Student Information Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 print:pb-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 print:text-lg">
              {student.name}
            </h2>
            <span className="rounded bg-brand px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white print:border print:border-slate-800 print:text-slate-900 print:bg-slate-100">
              {student.department} · {DEPARTMENT_NAMES[student.department]}
            </span>
            {student.onProbation && (
              <span className="rounded bg-rose-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white print:border print:border-rose-700">
                Probation (Half-Load 12 Cr.)
              </span>
            )}
            {report.graduationEligible && (
              <span className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white">
                Graduation Eligible
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
            <span>
              <strong className="text-slate-900">ID:</strong> {student.id}
            </span>
            <span>•</span>
            <span>
              <strong className="text-slate-900">Source:</strong> {student.fileName}
            </span>
            {report.latestSemester && (
              <>
                <span>•</span>
                <span>
                  <strong className="text-slate-900">Latest Term:</strong>{" "}
                  {report.latestSemester.label}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Academic Stats */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="rounded-lg bg-slate-50 px-3 py-1.5 border border-slate-200 print:bg-transparent">
            <div className="text-[10px] uppercase font-bold text-slate-500">GPA</div>
            <div
              className={`text-base font-extrabold ${
                student.onProbation ? "text-rose-600" : "text-slate-900"
              }`}
            >
              {student.gpa !== null ? student.gpa.toFixed(2) : "N/A"}
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 px-3 py-1.5 border border-slate-200 print:bg-transparent">
            <div className="text-[10px] uppercase font-bold text-slate-500">
              Earned Credits
            </div>
            <div className="text-base font-extrabold text-emerald-700">
              {student.totalCreditHours} <span className="text-xs text-slate-500 font-normal">/ 132 Cr</span>
            </div>
          </div>

          {report.ungradedCourses.length > 0 && (
            <div className="rounded-lg bg-slate-50 px-3 py-1.5 border border-slate-200 print:bg-transparent">
              <div className="text-[10px] uppercase font-bold text-slate-500">
                In Progress
              </div>
              <div className="text-base font-extrabold text-amber-600">
                {student.expectedCreditHours - student.totalCreditHours} Cr
                <span className="text-xs text-slate-500 font-normal">
                  {" "}
                  ({report.ungradedCourses.length} courses)
                </span>
              </div>
            </div>
          )}

          <div className="rounded-lg bg-slate-50 px-3 py-1.5 border border-slate-200 print:bg-transparent">
            <div className="text-[10px] uppercase font-bold text-slate-500">
              Expected Cr
            </div>
            <div className="text-base font-extrabold text-blue-700">
              {student.expectedCreditHours} Cr
            </div>
          </div>

          {/* Action buttons (hidden in print) */}
          <div className="flex items-center gap-2 print:hidden ml-2">
            {onPrintStudent && (
              <button
                type="button"
                onClick={() => onPrintStudent(student)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-slate-900 transition-colors"
                title="Print this student's graph view"
              >
                <svg
                  className="w-3.5 h-3.5 text-slate-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                Print
              </button>
            )}
            {onViewReport && (
              <button
                type="button"
                onClick={() => onViewReport(student)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-blue-700 transition-colors"
                title="Open full interactive advising report"
              >
                Interactive View
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 text-[11px] text-slate-600 print:text-[9px] print:pb-1 print:mt-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-slate-700">Legend:</span>
          {(
            [
              "completed",
              "ungraded",
              "available",
              "blocked",
              "failed",
              "elective",
            ] as CourseStatus[]
          ).map((status) => {
            const style = STATUS_COLOR_MAP[status];
            return (
              <div key={status} className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-3 w-3 rounded-xs border ${style.border} ${style.card} print:h-2.5 print:w-2.5`}
                />
                <span className="font-medium">{style.label}</span>
              </div>
            );
          })}
        </div>

        <div className="text-[10px] text-slate-400 font-mono print:text-slate-600">
          Student {index + 1} of {totalStudents}
        </div>
      </div>

      {/* Prerequisite Curriculum Course Grid (Semester by Semester) */}
      <div className="mt-4 overflow-x-auto print:overflow-visible print:mt-2">
        <div
          className="grid gap-2 min-w-[960px] print:min-w-0"
          style={{
            gridTemplateColumns: `repeat(${Math.max(columnsData.length, 1)}, minmax(0, 1fr))`,
          }}
        >
          {columnsData.map((column) => (
            <div
              key={column.label}
              className="flex flex-col rounded-lg bg-slate-50/70 border border-slate-200/80 p-1.5 print:bg-white print:border-slate-300 print:p-1"
            >
              {/* Semester Header */}
              <div className="mb-2 rounded bg-brand/90 py-1 px-2 text-center text-[11px] font-bold tracking-wider uppercase text-white print:bg-slate-800 print:text-[10px] print:py-0.5">
                {column.label}
              </div>

              {/* Course Cards in Column */}
              <div className="flex flex-col gap-1.5 print:gap-1">
                {column.nodes.map((node) => {
                  const style = STATUS_COLOR_MAP[node.status];
                  return (
                    <div
                      key={node.id}
                      className={`relative rounded-md border p-1.5 shadow-2xs transition-all ${style.card} ${
                        node.isElectiveSlot ? "border-dashed" : ""
                      } print:shadow-none print:p-1`}
                    >
                      {/* Code & Grade Badge */}
                      <div className="flex items-center justify-between gap-1 leading-none">
                        <span className="font-mono text-[11px] font-bold tracking-tight print:text-[9px]">
                          {node.code}
                        </span>
                        {node.grade && (
                          <span
                            className={`rounded px-1 py-0.2 text-[10px] font-extrabold shadow-2xs border ${style.badge} print:text-[8px] print:px-0.5`}
                          >
                            {node.grade}
                          </span>
                        )}
                        {!node.grade && node.creditReq && (
                          <span className="rounded bg-slate-200/80 px-1 py-0.2 text-[9px] font-semibold text-slate-700 print:text-[7px]">
                            {node.creditReq}
                          </span>
                        )}
                      </div>

                      {/* Course Title */}
                      <div
                        className="mt-1 text-[10px] leading-tight line-clamp-2 print:text-[8px] print:leading-none"
                        title={node.title}
                      >
                        {node.title}
                      </div>

                      {/* Status Tag / Prereq alert if failed or available */}
                      {node.status === "available" && (
                        <div className="mt-1 text-[9px] font-semibold text-blue-700 print:text-[7px] print:text-blue-900">
                          Eligible to register
                        </div>
                      )}
                      {node.status === "failed" && (
                        <div className="mt-1 text-[9px] font-bold text-rose-700 print:text-[7px]">
                          Must retake
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Next Semester Recommended Courses Preview Bar */}
      {report.availableCourses.length > 0 && (
        <div className="mt-4 rounded-lg bg-blue-50/70 border border-blue-200 p-2.5 print:mt-2 print:p-1.5 text-xs text-blue-950 print:text-[9px]">
          <div className="flex items-center gap-1.5 font-bold mb-1">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-600 print:bg-blue-800" />
            <span>Recommended Core Courses for Next Semester:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {report.availableCourses.slice(0, 6).map((c) => (
              <span
                key={c.code}
                className="rounded border border-blue-300 bg-white px-1.5 py-0.5 text-[11px] font-medium print:text-[8px]"
              >
                <strong className="font-mono">{c.code}</strong> · {c.title}
              </span>
            ))}
            {report.availableCourses.length > 6 && (
              <span className="text-[11px] text-blue-700 self-center font-medium print:text-[8px]">
                +{report.availableCourses.length - 6} more eligible
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
