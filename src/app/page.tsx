"use client";

import { useState } from "react";
import { FileUpload } from "@/components/FileUpload";
import { ReportDisplay } from "@/components/ReportDisplay";
import { Header } from "@/components/Header";
import { TranscriptData, AnalysisReport } from "@/types";
import { parseTranscriptPDF } from "@/lib/analysis/transcriptParser";
import { generateReport } from "@/lib/analysis/reportGenerator";

type Step = "upload" | "report";

export default function Home() {
  const [step, setStep] = useState<Step>("upload");
  const [transcriptData, setTranscriptData] = useState<TranscriptData | null>(
    null
  );
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    setLoading(true);
    setError(null);

    try {
      // Read file as buffer
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Parse transcript - extracts student info, courses, and department
      const data = await parseTranscriptPDF(buffer);

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-6xl">
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

      <footer className="mt-16 py-6 text-center text-sm text-gray-600">
        <p>Copyright 2024 Eng. Moheeb and Eng. Hagar</p>
        <p className="mt-1">
          CCIT - College of Computing and Information Technology
        </p>
      </footer>
    </div>
  );
}
