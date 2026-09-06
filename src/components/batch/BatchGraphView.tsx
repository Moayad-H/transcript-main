"use client";

import React, { useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { BatchStudentResult, BatchProcessingError } from "@/lib/utils/batchTranscriptProcessor";
import { PrintableStudentGraph } from "./PrintableStudentGraph";
import { Department } from "@/types";
import { DEPARTMENTS } from "@/lib/constants";
import { logAdvisorAction } from "@/lib/logging/auditLogger";

// Dynamically import CourseGraphView for single-student interactive mode
const CourseGraphView = dynamic(() => import("../CourseGraphView"), {
  ssr: false,
});

interface BatchGraphViewProps {
  students: BatchStudentResult[];
  errors?: BatchProcessingError[];
  onReset: () => void;
  onOpenSingleReport: (student: BatchStudentResult) => void;
}

export function BatchGraphView({
  students,
  errors = [],
  onReset,
  onOpenSingleReport,
}: BatchGraphViewProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDept, setSelectedDept] = useState<Department | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<"name" | "id" | "gpa" | "credits">("name");
  const [viewMode, setViewMode] = useState<"sheets" | "interactive">("sheets");
  const [selectedStudentId, setSelectedStudentId] = useState<string>(
    students[0]?.id || ""
  );
  const [printingStudentId, setPrintingStudentId] = useState<string | null>(null);

  // Filter & sort students
  const filteredStudents = useMemo(() => {
    return students
      .filter((s) => {
        const matchesDept = selectedDept === "ALL" || s.department === selectedDept;
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch =
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.id.toLowerCase().includes(q) ||
          s.fileName.toLowerCase().includes(q);
        return matchesDept && matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "id") return a.id.localeCompare(b.id);
        if (sortBy === "gpa") return (b.gpa ?? 0) - (a.gpa ?? 0);
        if (sortBy === "credits") return b.totalCreditHours - a.totalCreditHours;
        return 0;
      });
  }, [students, selectedDept, searchQuery, sortBy]);

  const selectedStudent = useMemo(() => {
    return (
      students.find((s) => s.id === selectedStudentId) ||
      filteredStudents[0] ||
      students[0]
    );
  }, [students, selectedStudentId, filteredStudents]);

  // Statistics
  const stats = useMemo(() => {
    const probationCount = students.filter((s) => s.onProbation).length;
    const gradEligibleCount = students.filter((s) => s.report.graduationEligible).length;
    const avgGpa =
      students.reduce((sum, s) => sum + (s.gpa ?? 0), 0) /
      Math.max(students.filter((s) => s.gpa !== null).length, 1);

    return { probationCount, gradEligibleCount, avgGpa };
  }, [students]);

  const handlePrintAll = () => {
    setPrintingStudentId(null);
    logAdvisorAction({
      action: "BATCH_PRINTED",
      metadata: { count: filteredStudents.length },
    });
    window.print();
  };

  const handlePrintSingle = (student: BatchStudentResult) => {
    setPrintingStudentId(student.id);
    logAdvisorAction({
      action: "STUDENT_PRINTED",
      studentId: student.transcriptData.studentId,
      studentName: student.transcriptData.studentName,
      department: student.transcriptData.department,
      metadata: { source: "batch" },
    });
    // Give state a moment to render print isolation class, then trigger print
    setTimeout(() => {
      window.print();
      setPrintingStudentId(null);
    }, 80);
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* Top Banner / Toolbar (Hidden when printing) */}
      <div className="print:hidden rounded-xl bg-brand p-5 text-white shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-blue-500/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-blue-200 border border-blue-400/30">
                Batch Advising
              </span>
              <h1 className="text-xl font-bold tracking-tight">
                Student Course Graphs ({students.length} Transcripts)
              </h1>
            </div>
            <p className="mt-1 text-xs text-blue-200">
              Generated printable prerequisite course graphs for academic advising.
            </p>
          </div>

          {/* Top Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrintAll}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-500 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              Print All Students ({filteredStudents.length})
            </button>

            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors border border-white/20 cursor-pointer"
            >
              ← Upload New Batch
            </button>
          </div>
        </div>

        {/* Quick Batch Statistics Bar */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-t border-white/15 pt-3 text-xs">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-blue-200">Total Transcripts</span>
            <span className="text-base font-extrabold text-white">{students.length}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-blue-200">Average GPA</span>
            <span className="text-base font-extrabold text-white">{stats.avgGpa.toFixed(2)}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-blue-200">On Academic Probation</span>
            <span
              className={`text-base font-extrabold ${
                stats.probationCount > 0 ? "text-amber-300" : "text-white"
              }`}
            >
              {stats.probationCount} students
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-blue-200">Graduation Ready</span>
            <span className="text-base font-extrabold text-emerald-300">
              {stats.gradEligibleCount} students
            </span>
          </div>
        </div>
      </div>

      {/* Parsing Errors Accordion (if any files failed) */}
      {errors.length > 0 && (
        <div className="print:hidden rounded-lg bg-amber-50 border border-amber-300 p-4 text-xs text-amber-900">
          <div className="flex items-center gap-2 font-bold mb-1">
            <span className="text-amber-600">⚠️</span>
            <span>{errors.length} file(s) could not be parsed:</span>
          </div>
          <ul className="list-disc pl-5 space-y-0.5 text-amber-800 mt-1">
            {errors.map((err, i) => (
              <li key={i}>
                <strong>{err.fileName}:</strong> {err.error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Control Bar: Filters, Search, and View Mode Toggle (Hidden in print) */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
        {/* Search & Dept Filters */}
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              placeholder="Search student name or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-xs text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <svg
              className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>

          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value as Department | "ALL")}
            className="rounded-lg border border-slate-300 py-1.5 px-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
          >
            <option value="ALL">All Departments ({students.length})</option>
            {DEPARTMENTS.map((dept) => {
              const count = students.filter((s) => s.department === dept).length;
              return (
                <option key={dept} value={dept}>
                  {dept} ({count})
                </option>
              );
            })}
          </select>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "name" | "id" | "gpa" | "credits")}
            className="rounded-lg border border-slate-300 py-1.5 px-2.5 text-xs text-slate-800 focus:border-blue-500 focus:outline-none"
          >
            <option value="name">Sort by: Name (A-Z)</option>
            <option value="id">Sort by: ID</option>
            <option value="gpa">Sort by: Highest GPA</option>
            <option value="credits">Sort by: Earned Credits</option>
          </select>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center rounded-lg bg-slate-100 p-1 border border-slate-200 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setViewMode("sheets")}
            className={`rounded-md px-3 py-1 transition-colors ${
              viewMode === "sheets"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📄 Printable Sheets ({filteredStudents.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode("interactive")}
            className={`rounded-md px-3 py-1 transition-colors ${
              viewMode === "interactive"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            🔍 Interactive Single Graph
          </button>
        </div>
      </div>

      {/* Content View */}
      {viewMode === "sheets" ? (
        /* Printable Sheets View: Renders each student's course graph */
        <div className="space-y-6">
          {filteredStudents.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-slate-200 text-slate-500 text-sm">
              No students match your search filter.
            </div>
          ) : (
            filteredStudents.map((student, idx) => {
              const isTargetedForPrint =
                printingStudentId === null || printingStudentId === student.id;

              return (
                <div
                  key={student.id}
                  className={`${
                    !isTargetedForPrint ? "print:hidden" : ""
                  }`}
                >
                  <PrintableStudentGraph
                    student={student}
                    index={idx}
                    totalStudents={filteredStudents.length}
                    onViewReport={() => onOpenSingleReport(student)}
                    onPrintStudent={handlePrintSingle}
                  />
                </div>
              );
            })
          )}
        </div>
      ) : (
        /* Interactive Single Graph View: Select a student to explore their interactive React Flow graph */
        <div className="flex flex-col lg:flex-row gap-4 min-h-[700px]">
          {/* Left Student Selector Sidebar */}
          <div className="lg:w-72 shrink-0 bg-white rounded-xl border border-slate-200 p-3 shadow-2xs flex flex-col h-auto lg:h-[700px] overflow-hidden">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2 px-1">
              Select Student ({filteredStudents.length})
            </h3>
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
              {filteredStudents.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStudentId(s.id)}
                  className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all ${
                    s.id === selectedStudent?.id
                      ? "border-blue-500 bg-blue-50/80 shadow-2xs text-blue-950"
                      : "border-slate-200 hover:bg-slate-50 text-slate-700"
                  }`}
                >
                  <div className="font-bold truncate">{s.name}</div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 mt-0.5">
                    <span>{s.id}</span>
                    <span className="font-semibold text-slate-700">
                      {s.department} · {s.gpa !== null ? s.gpa.toFixed(2) : "N/A"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right Graph Canvas for the Selected Student */}
          {selectedStudent && (
            <div className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3 mb-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {selectedStudent.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    ID: {selectedStudent.id} • {selectedStudent.department} • GPA:{" "}
                    {selectedStudent.gpa !== null ? selectedStudent.gpa.toFixed(2) : "N/A"} •{" "}
                    {selectedStudent.totalCreditHours}/132 Credits
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePrintSingle(selectedStudent)}
                    className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Print Graph
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenSingleReport(selectedStudent)}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                  >
                    Open Full Report Cockpit
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-[550px]">
                <CourseGraphView
                  report={selectedStudent.report}
                  transcriptData={selectedStudent.transcriptData}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
