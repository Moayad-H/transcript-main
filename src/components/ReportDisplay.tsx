"use client";

import { useEffect, useState, useMemo } from "react";
import dynamic from "next/dynamic";
import { AnalysisReport, TranscriptData, Department } from "@/types";
import { logAdvisorAction } from "@/lib/logging/auditLogger";
import { buildCourseGraph, CourseGraph } from "@/lib/analysis/courseGraphBuilder";
import { BatchStudentResult } from "@/lib/utils/batchTranscriptProcessor";
import { PrintableStudentGraph } from "./batch/PrintableStudentGraph";
import { StudentBar } from "./report/StudentBar";
import { AlertStrip } from "./report/AlertStrip";
import { NextSemesterHero } from "./report/NextSemesterHero";
import { RequirementsCard } from "./report/RequirementsCard";
import { AcademicAuditCard } from "./report/AcademicAuditCard";

// Client-only: React Flow measures the DOM, so keep it out of the static export prerender.
const CourseGraphView = dynamic(() => import("./CourseGraphView"), {
  ssr: false,
});

interface ReportDisplayProps {
  report: AnalysisReport;
  transcriptData: TranscriptData;
  onReset: () => void;
  onDepartmentChange?: (department: Department) => void;
  fileName?: string;
  initialGraph?: CourseGraph | null;
  studentIndex?: number;
  totalStudents?: number;
}

export function ReportDisplay({
  report,
  transcriptData,
  onReset,
  onDepartmentChange,
  fileName,
  initialGraph,
  studentIndex,
  totalStudents,
}: ReportDisplayProps) {
  const [view, setView] = useState<"report" | "graph">("report");
  const [graph, setGraph] = useState<CourseGraph | null>(initialGraph || null);

  // Sync initial graph if provided
  useEffect(() => {
    if (initialGraph) {
      setGraph(initialGraph);
    }
  }, [initialGraph]);

  // Lock body scroll on wide screens so cards scroll internally in cockpit view.
  useEffect(() => {
    document.body.classList.add("cockpit-lock");
    return () => document.body.classList.remove("cockpit-lock");
  }, []);

  // Set document.title to student's name so browser PDF printing names the file after the student
  useEffect(() => {
    const originalTitle = document.title;
    if (report.studentName) {
      document.title = report.studentName.trim();
    }

    const handleBeforePrint = () => {
      if (report.studentName) {
        document.title = report.studentName.trim();
      }
    };

    window.addEventListener("beforeprint", handleBeforePrint);

    return () => {
      window.removeEventListener("beforeprint", handleBeforePrint);
      document.title = originalTitle;
    };
  }, [report.studentName]);

  // Build the prerequisite graph for printing (and caching for CourseGraphView)
  useEffect(() => {
    let cancelled = false;
    buildCourseGraph(transcriptData.department, transcriptData, report)
      .then((builtGraph) => {
        if (!cancelled) {
          setGraph(builtGraph);
        }
      })
      .catch((err) => {
        console.error("Failed to build course graph for report print:", err);
      });

    return () => {
      cancelled = true;
    };
  }, [transcriptData, report]);

  const handlePrint = async () => {
    logAdvisorAction({
      action: "STUDENT_PRINTED",
      studentId: report.studentID,
      studentName: report.studentName,
      department: transcriptData.department,
      metadata: { source: "single" },
    });

    if (report.studentName) {
      document.title = report.studentName.trim();
    }

    if (!graph) {
      try {
        const builtGraph = await buildCourseGraph(
          transcriptData.department,
          transcriptData,
          report
        );
        setGraph(builtGraph);
        setTimeout(() => {
          window.print();
        }, 80);
        return;
      } catch (err) {
        console.error("Failed to build graph before printing:", err);
      }
    }

    window.print();
  };

  const printableStudent: BatchStudentResult = useMemo(() => {
    return {
      id: report.studentID,
      name: report.studentName,
      department: transcriptData.department,
      gpa: report.gpa,
      totalCreditHours: report.totalCreditHours,
      expectedCreditHours: report.expectedCreditHours,
      onProbation: report.onProbation,
      fileName: fileName || `${report.studentID}.pdf`,
      transcriptData,
      report,
      graph: graph || { nodes: [], edges: [], columns: [] },
    };
  }, [report, transcriptData, fileName, graph]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 print:block print:gap-0">
      {/* Interactive Cockpit View (Hidden when printing) */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 print:hidden">
        <StudentBar
          report={report}
          view={view}
          onViewChange={setView}
          onBack={onReset}
          onPrint={handlePrint}
          onDepartmentChange={onDepartmentChange}
        />

        {view === "graph" ? (
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <CourseGraphView report={report} transcriptData={transcriptData} />
          </div>
        ) : (
          <>
            <AlertStrip report={report} />

            {/* 2-Zone Layout:
                - Left Zone (~60%): Next-Semester Registration Hub (Action Center)
                - Right Zone (~40%): Degree Requirements + Academic Health & Audit */}
            <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-3 overflow-y-auto pb-1 xl:grid-cols-12 xl:items-stretch xl:overflow-hidden">
              {/* Zone 1: Action Center / Next-Semester Registration */}
              <div className="flex min-h-0 flex-col xl:col-span-7 xl:h-full">
                <NextSemesterHero
                  report={report}
                  className="min-h-[22rem] xl:min-h-0 xl:h-full"
                />
              </div>

              {/* Zone 2: Degree Audit & Diagnostics */}
              <div className="flex min-h-0 flex-col gap-3 xl:col-span-5 xl:h-full">
                <RequirementsCard
                  report={report}
                  className="min-h-[14rem] xl:min-h-0 xl:flex-1"
                />
                <AcademicAuditCard
                  report={report}
                  className="min-h-[14rem] xl:min-h-0 xl:flex-1"
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Printable Sheet View: Rendered exactly like the batch student graph (Visible ONLY when printing) */}
      {graph && (
        <div className="hidden print:block w-full">
          <PrintableStudentGraph
            student={printableStudent}
            index={studentIndex ?? 0}
            totalStudents={totalStudents ?? 1}
          />
        </div>
      )}
    </div>
  );
}
