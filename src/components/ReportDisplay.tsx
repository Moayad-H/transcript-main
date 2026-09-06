"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnalysisReport, TranscriptData, Department } from "@/types";
import { formatReportAsText } from "@/lib/analysis/reportGenerator";
import { downloadTextFile } from "@/lib/utils/helpers";
import { logAdvisorAction } from "@/lib/logging/auditLogger";
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
}

export function ReportDisplay({
  report,
  transcriptData,
  onReset,
  onDepartmentChange,
}: ReportDisplayProps) {
  const [view, setView] = useState<"report" | "graph">("report");

  // Lock body scroll on wide screens so cards scroll internally in cockpit view.
  useEffect(() => {
    document.body.classList.add("cockpit-lock");
    return () => document.body.classList.remove("cockpit-lock");
  }, []);

  const handleDownload = async () => {
    logAdvisorAction({
      action: "REPORT_DOWNLOADED",
      studentId: report.studentID,
      studentName: report.studentName,
      department: transcriptData.department,
      metadata: { format: "text" },
    });

    try {
      const response = await fetch("/api/download-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ report }),
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.studentName}_report.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
      // Fallback to client-side download
      const textContent = formatReportAsText(report);
      downloadTextFile(textContent, `${report.studentName}_report.txt`);
    }
  };

  const handlePrint = () => {
    logAdvisorAction({
      action: "STUDENT_PRINTED",
      studentId: report.studentID,
      studentName: report.studentName,
      department: transcriptData.department,
    });
    window.print();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 print:block">
      <StudentBar
        report={report}
        view={view}
        onViewChange={setView}
        onBack={onReset}
        onPrint={handlePrint}
        onDownload={handleDownload}
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
          <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-3 overflow-y-auto pb-1 xl:grid-cols-12 xl:items-stretch xl:overflow-hidden print:block print:overflow-visible">
            {/* Zone 1: Action Center / Next-Semester Registration */}
            <div className="flex min-h-0 flex-col xl:col-span-7 xl:h-full print:block print:mb-4">
              <NextSemesterHero
                report={report}
                className="min-h-[22rem] xl:min-h-0 xl:h-full"
              />
            </div>

            {/* Zone 2: Degree Audit & Diagnostics */}
            <div className="flex min-h-0 flex-col gap-3 xl:col-span-5 xl:h-full print:block">
              <RequirementsCard
                report={report}
                className="min-h-[14rem] xl:min-h-0 xl:flex-1 print:mb-4"
              />
              <AcademicAuditCard
                report={report}
                className="min-h-[14rem] xl:min-h-0 xl:flex-1 print:mb-4"
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
