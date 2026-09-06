"use client";

import { useEffect, useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { ReportDisplay } from "@/components/ReportDisplay";
import { Header } from "@/components/Header";
import { LoginScreen } from "@/components/LoginScreen";
import { TranscriptData, AnalysisReport, Department } from "@/types";
import { parseTranscriptPDF } from "@/lib/analysis/transcriptParser";
import { generateReport } from "@/lib/analysis/reportGenerator";
import { Analytics } from "@vercel/analytics/next"
import {
  AdvisorSession,
  clearSession,
  loadSession,
  saveSession,
} from "@/lib/auth/session";
import { logAdvisorAction } from "@/lib/logging/auditLogger";

import {
  BatchStudentResult,
  BatchProcessingError,
  BatchProcessingProgress,
  processBatchTranscripts,
} from "@/lib/utils/batchTranscriptProcessor";
import { CourseGraph, buildCourseGraph } from "@/lib/analysis/courseGraphBuilder";
import { BatchGraphView } from "@/components/batch/BatchGraphView";
import { AdvisorGuideModal } from "@/components/AdvisorGuideModal";

type Step = "upload" | "report" | "batch";

export default function Home() {
  const [advisor, setAdvisor] = useState<AdvisorSession | null>(null);
  // localStorage is only readable after mount, so gate the first paint until checked.
  const [sessionChecked, setSessionChecked] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [transcriptData, setTranscriptData] = useState<TranscriptData | null>(
    null
  );
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [batchStudents, setBatchStudents] = useState<BatchStudentResult[]>([]);
  const [batchErrors, setBatchErrors] = useState<BatchProcessingError[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchProcessingProgress | null>(
    null
  );
  const [singleFileName, setSingleFileName] = useState<string>("");
  const [singleGraph, setSingleGraph] = useState<CourseGraph | null>(null);
  const [batchStudentIndex, setBatchStudentIndex] = useState<number | undefined>(undefined);
  const [batchTotalStudents, setBatchTotalStudents] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  useEffect(() => {
    const session = loadSession();
    setAdvisor(session);
    setSessionChecked(true);

    if (session && typeof window !== "undefined") {
      const guideKey = `ershad_guide_seen_${session.staff_id}`;
      if (!window.localStorage.getItem(guideKey)) {
        setIsGuideOpen(true);
      }
    }
  }, []);

  const handleLogin = (session: AdvisorSession) => {
    saveSession(session);
    setAdvisor(session);
    logAdvisorAction({
      action: "LOGIN",
      staffId: session.staff_id,
      advisorName: session.name,
    });
    if (typeof window !== "undefined") {
      const guideKey = `ershad_guide_seen_${session.staff_id}`;
      if (!window.localStorage.getItem(guideKey)) {
        setIsGuideOpen(true);
      }
    }
  };

  const handleLogout = () => {
    clearSession();
    setAdvisor(null);
    setStep("upload");
    setTranscriptData(null);
    setReport(null);
    setBatchStudents([]);
    setBatchErrors([]);
    setBatchProgress(null);
    setError(null);
    setIsGuideOpen(false);
  };

  const handleCloseGuide = () => {
    setIsGuideOpen(false);
    if (advisor && typeof window !== "undefined") {
      window.localStorage.setItem(`ershad_guide_seen_${advisor.staff_id}`, "true");
    }
  };

  const handleFileUpload = async (file: File, department?: Department) => {
    setLoading(true);
    setError(null);

    try {
      // Read file as buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Parse transcript - extracts student info, courses, and department
      const data = await parseTranscriptPDF(buffer);

      // Apply user-selected department, overriding the one inferred from the PDF
      if (department) {
        data.department = department;
      }

      setTranscriptData(data);

      // Automatically generate report with extracted data
      const generatedReport = await generateReport(
        data.studentId,
        data.studentName,
        data.department,
        data
      );

      setReport(generatedReport);
      setSingleFileName(file.name);
      setSingleGraph(null);
      setBatchStudentIndex(undefined);
      setBatchTotalStudents(undefined);

      try {
        const g = await buildCourseGraph(
          data.department,
          data,
          generatedReport
        );
        setSingleGraph(g);
      } catch (graphErr) {
        console.warn("Could not pre-build graph for single upload:", graphErr);
      }

      setStep("report");

      logAdvisorAction({
        action: "TRANSCRIPT_PARSED",
        studentId: data.studentId,
        studentName: data.studentName,
        department: data.department,
        metadata: {
          gpa: data.gpa,
          totalCreditHours: generatedReport.totalCreditHours,
          expectedCreditHours: generatedReport.expectedCreditHours,
          fileName: file.name,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleBatchUpload = async (files: File[], department?: Department) => {
    setLoading(true);
    setError(null);
    setBatchProgress(null);

    try {
      const result = await processBatchTranscripts(files, {
        departmentOverride: department,
        onProgress: (progress) => setBatchProgress(progress),
      });

      if (result.students.length === 0) {
        throw new Error(
          result.errors.length > 0
            ? `Failed to process transcripts: ${result.errors
              .map((e) => `${e.fileName}: ${e.error}`)
              .join("; ")}`
            : "No valid PDF transcripts found in the selected folder or archive."
        );
      }

      setBatchStudents(result.students);
      setBatchErrors(result.errors);
      setStep("batch");

      logAdvisorAction({
        action: "BATCH_PROCESSED",
        department: department,
        metadata: {
          totalFiles: files.length,
          successfulStudents: result.students.length,
          failedCount: result.errors.length,
          studentIds: result.students.map((s) => s.transcriptData.studentId),
        },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred during batch transcript processing"
      );
    } finally {
      setLoading(false);
      setBatchProgress(null);
    }
  };

  const handleOpenSingleReportFromBatch = (student: BatchStudentResult) => {
    setTranscriptData(student.transcriptData);
    setReport(student.report);
    setSingleFileName(student.fileName);
    setSingleGraph(student.graph);
    const idx = batchStudents.findIndex((s) => s.id === student.id);
    setBatchStudentIndex(idx >= 0 ? idx : 0);
    setBatchTotalStudents(batchStudents.length);
    setStep("report");
  };

  const handleReset = () => {
    setStep("upload");
    setTranscriptData(null);
    setReport(null);
    setSingleFileName("");
    setSingleGraph(null);
    setBatchStudentIndex(undefined);
    setBatchTotalStudents(undefined);
    setBatchStudents([]);
    setBatchErrors([]);
    setBatchProgress(null);
    setError(null);
  };

  const handleDepartmentChange = async (newDepartment: Department) => {
    if (!transcriptData) return;
    setLoading(true);
    setError(null);
    try {
      const updatedTranscriptData: TranscriptData = {
        ...transcriptData,
        department: newDepartment,
      };
      setTranscriptData(updatedTranscriptData);

      const generatedReport = await generateReport(
        updatedTranscriptData.studentId,
        updatedTranscriptData.studentName,
        newDepartment,
        updatedTranscriptData
      );

      setReport(generatedReport);

      try {
        const g = await buildCourseGraph(
          newDepartment,
          updatedTranscriptData,
          generatedReport
        );
        setSingleGraph(g);
      } catch (graphErr) {
        console.warn("Could not pre-build graph on department change:", graphErr);
      }

      logAdvisorAction({
        action: "DEPARTMENT_CHANGED",
        studentId: updatedTranscriptData.studentId,
        studentName: updatedTranscriptData.studentName,
        department: newDepartment,
        metadata: {
          previousDepartment: transcriptData.department,
          newDepartment,
        },
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to recalculate report for new department"
      );
    } finally {
      setLoading(false);
    }
  };

  if (!sessionChecked) {
    return <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50" />;
  }

  if (!advisor) {
    return <LoginScreen onLogin={handleLogin} />;
  }

  // The report is a full-viewport dashboard: it needs the whole width, a
  // slimmer header, and the leftover height as a flex child.
  const inReport = step === "report" && !!report && !!transcriptData;
  const inBatch = step === "batch" && batchStudents.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-br from-blue-50 to-indigo-50">
      <Header
        advisorName={advisor.name}
        onLogout={handleLogout}
        onOpenGuide={() => setIsGuideOpen(true)}
        compact={inReport || inBatch}
      />

      <main
        className={
          inReport
            ? "flex min-h-0 flex-1 flex-col px-3 py-3 print:block print:p-0"
            : inBatch
              ? "container mx-auto px-4 py-6 max-w-7xl print:block print:p-0 print:max-w-none"
              : "container mx-auto px-4 py-8 max-w-6xl"
        }
      >
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {step === "upload" && (
          <div className="space-y-4">
            <FileUpload
              onFileUpload={handleFileUpload}
              onBatchUpload={handleBatchUpload}
              batchProgress={batchProgress}
              loading={loading}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50/90 border border-blue-200 px-4 py-3 text-xs text-blue-900 shadow-2xs">
              <div className="flex items-center gap-2.5">
                <span className="text-base shrink-0">💡</span>
                <span>
                  <strong>New to ERSHAD?</strong> Check out our quick interactive guide on transcript parsing, course recommendations, degree audits, and prerequisite graph simulation.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideOpen(true)}
                className="font-bold text-blue-700 hover:text-blue-950 underline shrink-0 cursor-pointer"
              >
                Open Advisor Guide →
              </button>
            </div>
          </div>
        )}

        {step === "batch" && inBatch && (
          <BatchGraphView
            students={batchStudents}
            errors={batchErrors}
            onReset={handleReset}
            onOpenSingleReport={handleOpenSingleReportFromBatch}
          />
        )}

        {step === "report" && report && transcriptData && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            {batchStudents.length > 0 && (
              <div className="print:hidden mb-1 flex shrink-0 items-center justify-between bg-blue-50/80 px-3 py-1.5 rounded-lg border border-blue-200 text-xs">
                <span className="text-blue-900 font-medium">
                  Viewing student report from batch ({batchStudents.length} students loaded)
                </span>
                <button
                  type="button"
                  onClick={() => setStep("batch")}
                  className="font-bold text-blue-700 hover:text-blue-900 underline cursor-pointer"
                >
                  ← Return to Batch Graphs
                </button>
              </div>
            )}
            <ReportDisplay
              report={report}
              transcriptData={transcriptData}
              onReset={handleReset}
              onDepartmentChange={handleDepartmentChange}
              fileName={singleFileName}
              initialGraph={singleGraph}
              studentIndex={batchStudentIndex}
              totalStudents={batchTotalStudents}
            />
          </div>
        )}
      </main>

      <footer
        className={`mt-16 py-6 text-center text-sm text-white-700 print:hidden ${inReport || inBatch ? "hidden" : ""
          }`}
      >
        <p>Copyright 2026 Dr. Moheeb and Eng. Hagar</p>
        <p className="mt-1">
          CCIT - College of Computing and Information Technology - Cairo
        </p>
      </footer>

      <AdvisorGuideModal
        isOpen={isGuideOpen}
        onClose={handleCloseGuide}
        advisorName={advisor.name}
        onDontShowAgain={(dontShow) => {
          if (dontShow && advisor && typeof window !== "undefined") {
            window.localStorage.setItem(`ershad_guide_seen_${advisor.staff_id}`, "true");
          }
        }}
      />

      <Analytics />
    </div>
  );
}
