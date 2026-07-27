"use client";

import { useEffect, useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { ReportDisplay } from "@/components/ReportDisplay";
import { Header } from "@/components/Header";
import { LoginScreen } from "@/components/LoginScreen";
import { TranscriptData, AnalysisReport, Department } from "@/types";
import { parseTranscriptPDF } from "@/lib/analysis/transcriptParser";
import { generateReport } from "@/lib/analysis/reportGenerator";
import {
  AdvisorSession,
  clearSession,
  loadSession,
  saveSession,
} from "@/lib/auth/session";

type Step = "upload" | "report";

export default function Home() {
  const [advisor, setAdvisor] = useState<AdvisorSession | null>(null);
  // localStorage is only readable after mount, so gate the first paint until checked.
  const [sessionChecked, setSessionChecked] = useState(false);
  const [step, setStep] = useState<Step>("upload");
  const [transcriptData, setTranscriptData] = useState<TranscriptData | null>(
    null
  );
  const [report, setReport] = useState<AnalysisReport | null>(null);
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

  const handleReset = () => {
    setStep("upload");
    setTranscriptData(null);
    setReport(null);
    setError(null);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-gradient-to-br from-blue-50 to-indigo-50">
      <Header
        advisorName={advisor.name}
        onLogout={handleLogout}
        compact={inReport}
      />

      <main
        className={
          inReport
            ? "flex min-h-0 flex-1 flex-col px-3 py-3 print:block print:p-0"
            : "container mx-auto px-4 py-8 max-w-6xl"
        }
      >
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <p className="font-semibold">Error:</p>
            <p>{error}</p>
          </div>
        )}

        {step === "upload" && (
          <FileUpload onFileUpload={handleFileUpload} loading={loading} />
        )}

        {step === "report" && report && transcriptData && (
          <ReportDisplay
            report={report}
            transcriptData={transcriptData}
            onReset={handleReset}
          />
        )}
      </main>

      <footer
        className={`mt-16 py-6 text-center text-sm text-white-600 print:hidden ${
          inReport ? "hidden" : ""
        }`}
      >
        <p>Copyright 2026 Dr. Moheeb and Eng. Hagar</p>
        <p className="mt-1">
          CCIT - College of Computing and Information Technology - Cairo
        </p>
      </footer>
    </div>
  );
}
