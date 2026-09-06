/**
 * Batch Transcript Processor
 * Handles unzipping and batch processing of student transcript PDFs,
 * generating analysis reports and course graphs with live progress reporting.
 */

import JSZip from "jszip";
import { TranscriptData, AnalysisReport, Department } from "@/types";
import { CourseGraph, buildCourseGraph } from "@/lib/analysis/courseGraphBuilder";
import { parseTranscriptPDF } from "@/lib/analysis/transcriptParser";
import { generateReport } from "@/lib/analysis/reportGenerator";

export interface BatchStudentResult {
  id: string;
  name: string;
  department: Department;
  gpa: number | null;
  totalCreditHours: number;
  expectedCreditHours: number;
  onProbation: boolean;
  fileName: string;
  transcriptData: TranscriptData;
  report: AnalysisReport;
  graph: CourseGraph;
}

export interface BatchProcessingProgress {
  current: number;
  total: number;
  currentFileName: string;
  phase: "extracting" | "parsing" | "complete";
}

export interface BatchProcessingError {
  fileName: string;
  error: string;
}

export interface BatchProcessingResult {
  students: BatchStudentResult[];
  errors: BatchProcessingError[];
}

interface PdfFileEntry {
  name: string;
  buffer: Buffer;
}

/**
 * Extract all PDF files from a list of files or archives (including .zip files).
 */
export async function extractPdfEntries(
  files: File[],
  onExtractProgress?: (fileName: string) => void
): Promise<PdfFileEntry[]> {
  const pdfEntries: PdfFileEntry[] = [];

  for (const file of files) {
    const lowerName = file.name.toLowerCase();

    if (lowerName.endsWith(".zip")) {
      onExtractProgress?.(file.name);
      try {
        const zip = await JSZip.loadAsync(file);
        const entries = Object.values(zip.files);

        for (const entry of entries) {
          if (entry.dir) continue;
          // Skip macOS metadata and hidden files
          if (
            entry.name.includes("__MACOSX/") ||
            entry.name.startsWith(".") ||
            entry.name.includes("/.") ||
            entry.name.endsWith(".DS_Store")
          ) {
            continue;
          }

          if (entry.name.toLowerCase().endsWith(".pdf")) {
            const arrayBuf = await entry.async("arraybuffer");
            const simpleName = entry.name.split("/").pop() || entry.name;
            pdfEntries.push({
              name: simpleName,
              buffer: Buffer.from(arrayBuf),
            });
          }
        }
      } catch (err) {
        console.error("Failed to read zip archive:", file.name, err);
        throw new Error(
          `Failed to extract ZIP archive "${file.name}": ${
            err instanceof Error ? err.message : "Invalid ZIP format"
          }`
        );
      }
    } else if (lowerName.endsWith(".pdf") || file.type === "application/pdf") {
      const arrayBuf = await file.arrayBuffer();
      pdfEntries.push({
        name: file.name,
        buffer: Buffer.from(arrayBuf),
      });
    }
  }

  return pdfEntries;
}

/**
 * Process multiple transcripts, generating reports and graphs for each.
 */
export async function processBatchTranscripts(
  files: File[],
  options?: {
    departmentOverride?: Department;
    onProgress?: (progress: BatchProcessingProgress) => void;
  }
): Promise<BatchProcessingResult> {
  const onProgress = options?.onProgress;
  const deptOverride = options?.departmentOverride;

  onProgress?.({
    current: 0,
    total: 0,
    currentFileName: "Scanning files and archives...",
    phase: "extracting",
  });

  const pdfEntries = await extractPdfEntries(files, (zipName) => {
    onProgress?.({
      current: 0,
      total: 0,
      currentFileName: `Extracting ${zipName}...`,
      phase: "extracting",
    });
  });

  if (pdfEntries.length === 0) {
    throw new Error(
      "No PDF transcript files found in the provided folder or ZIP archive."
    );
  }

  const students: BatchStudentResult[] = [];
  const errors: BatchProcessingError[] = [];
  const total = pdfEntries.length;

  for (let i = 0; i < total; i++) {
    const entry = pdfEntries[i];
    onProgress?.({
      current: i + 1,
      total,
      currentFileName: entry.name,
      phase: "parsing",
    });

    try {
      // 1. Parse PDF transcript
      const transcriptData = await parseTranscriptPDF(entry.buffer);

      if (deptOverride) {
        transcriptData.department = deptOverride;
      }

      // 2. Generate Advising Report
      const report = await generateReport(
        transcriptData.studentId,
        transcriptData.studentName,
        transcriptData.department,
        transcriptData
      );

      // 3. Build Prerequisite Course Graph
      const graph = await buildCourseGraph(
        transcriptData.department,
        transcriptData,
        report
      );

      students.push({
        id: transcriptData.studentId,
        name: transcriptData.studentName,
        department: transcriptData.department,
        gpa: report.gpa,
        totalCreditHours: report.totalCreditHours,
        expectedCreditHours: report.expectedCreditHours,
        onProbation: report.onProbation,
        fileName: entry.name,
        transcriptData,
        report,
        graph,
      });
    } catch (err) {
      console.error(`Error processing transcript ${entry.name}:`, err);
      errors.push({
        fileName: entry.name,
        error: err instanceof Error ? err.message : "Failed to parse transcript",
      });
    }
  }

  onProgress?.({
    current: total,
    total,
    currentFileName: "Done",
    phase: "complete",
  });

  return { students, errors };
}
