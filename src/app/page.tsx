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

import {
  BatchStudentResult,
  BatchProcessingError,
  BatchProcessingProgress,
  processBatchTranscripts,
} from "@/lib/utils/batchTranscriptProcessor";
import { BatchGraphView } from "@/components/batch/BatchGraphView";

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAdvisor(loadSession());
    setSessionChecked(true);
  }, []);

  const handleLogin = (session: AdvisorSession) => {
    saveSession(session);
    setAdvisor(session);
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
      setStep("report");
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
    setStep("report");
  };

  const handleReset = () => {
    setStep("upload");
    setTranscriptData(null);
    setReport(null);
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
          <FileUpload
            onFileUpload={handleFileUpload}
            onBatchUpload={handleBatchUpload}
            batchProgress={batchProgress}
            loading={loading}
          />
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
            />
          </div>
        )}
      </main>

      <footer
        className={`mt-16 py-6 text-center text-sm text-white-600 print:hidden ${
          inReport || inBatch ? "hidden" : ""
        }`}
      >
        <p>Copyright 2026 Dr. Moheeb and Eng. Hagar</p>
        <p className="mt-1">
          CCIT - College of Computing and Information Technology - Cairo
        </p>
      </footer>
      <Analytics />
    </div>
  );
}
