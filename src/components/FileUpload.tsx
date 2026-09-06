"use client";

import { useCallback, useRef, useState } from "react";
import { validateFile } from "@/lib/utils/fileValidation";
import { DEPARTMENTS, DEPARTMENT_NAMES } from "@/lib/constants";
import { Department } from "@/types";
import { BatchProcessingProgress } from "@/lib/utils/batchTranscriptProcessor";

interface FileUploadProps {
  onFileUpload: (file: File, department?: Department) => void;
  onBatchUpload?: (files: File[], department?: Department) => void;
  batchProgress?: BatchProcessingProgress | null;
  loading: boolean;
}

export function FileUpload({
  onFileUpload,
  onBatchUpload,
  batchProgress,
  loading,
}: FileUploadProps) {
  const [uploadMode, setUploadMode] = useState<"single" | "batch">("single");

  // Single file state
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [department, setDepartment] = useState<Department | "">("");
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Batch files state
  const [batchFiles, setBatchFiles] = useState<File[]>([]);
  const [batchSourceLabel, setBatchSourceLabel] = useState<string>("");

  const folderInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const multiPdfInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      setError(null);

      const items = e.dataTransfer.files;
      if (!items || items.length === 0) return;

      if (uploadMode === "single") {
        const file = items[0];
        const validation = validateFile(file);
        if (!validation.valid) {
          setError(validation.error || "Invalid file");
          return;
        }
        setSingleFile(file);
      } else {
        // Batch mode: accept zip, folder items, or multiple files
        const filesArray = Array.from(items);
        const hasZip = filesArray.some((f) => f.name.toLowerCase().endsWith(".zip"));
        const pdfCount = filesArray.filter((f) =>
          f.name.toLowerCase().endsWith(".pdf")
        ).length;

        if (!hasZip && pdfCount === 0) {
          setError("Please upload a .ZIP archive or PDF transcript files.");
          return;
        }

        setBatchFiles(filesArray);
        if (hasZip && filesArray.length === 1) {
          setBatchSourceLabel(`ZIP Archive: ${filesArray[0].name}`);
        } else if (hasZip) {
          setBatchSourceLabel(`${filesArray.length} items (including ZIP archives)`);
        } else {
          setBatchSourceLabel(`${pdfCount} PDF transcripts dropped`);
        }
      }
    },
    [uploadMode]
  );

  const handleSingleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setError(null);
    const files = e.target.files;
    if (files && files[0]) {
      const validation = validateFile(files[0]);
      if (!validation.valid) {
        setError(validation.error || "Invalid file");
        return;
      }
      setSingleFile(files[0]);
    }
  };

  const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setError(null);
    const files = e.target.files;
    if (files && files[0]) {
      const file = files[0];
      if (!file.name.toLowerCase().endsWith(".zip")) {
        setError("Please select a .zip archive.");
        return;
      }
      setBatchFiles([file]);
      setBatchSourceLabel(`ZIP Archive: ${file.name}`);
    }
  };

  const handleFolderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      const allFiles = Array.from(files);
      const pdfFiles = allFiles.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
      if (pdfFiles.length === 0) {
        setError("No PDF files found in the selected folder.");
        return;
      }
      setBatchFiles(allFiles);
      setBatchSourceLabel(`Folder: ${pdfFiles.length} PDF transcripts found`);
    }
  };

  const handleMultiPdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setError(null);
    const files = e.target.files;
    if (files && files.length > 0) {
      const allFiles = Array.from(files);
      setBatchFiles(allFiles);
      setBatchSourceLabel(`${allFiles.length} PDF transcripts selected`);
    }
  };

  const handleSubmit = () => {
    if (uploadMode === "single") {
      if (singleFile) {
        onFileUpload(singleFile, department || undefined);
      }
    } else {
      if (batchFiles.length > 0 && onBatchUpload) {
        onBatchUpload(batchFiles, department || undefined);
      }
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-xl shadow-md p-8 border border-slate-100">
        {/* Mode Selector Tabs */}
        <div className="flex rounded-lg bg-slate-100 p-1 mb-6 border border-slate-200">
          <button
            type="button"
            onClick={() => {
              setUploadMode("single");
              setError(null);
            }}
            disabled={loading}
            className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-md transition-all cursor-pointer ${
              uploadMode === "single"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📄 Single Transcript
          </button>
          <button
            type="button"
            onClick={() => {
              setUploadMode("batch");
              setError(null);
            }}
            disabled={loading}
            className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-md transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              uploadMode === "batch"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            📁 Batch Mode (Folder or ZIP)
            <span className="rounded bg-blue-100 text-blue-700 px-1.5 py-0.2 text-[10px] font-bold">
              New
            </span>
          </button>
        </div>

        <h2 className="text-2xl font-bold text-gray-800 mb-2">
          {uploadMode === "single"
            ? "Upload Student Transcript"
            : "Batch Transcript Processing"}
        </h2>
        <p className="text-gray-600 mb-6 text-sm">
          {uploadMode === "single"
            ? "Upload a single PDF transcript to analyze courses and generate academic advising report."
            : "Upload a folder or ZIP file containing multiple transcripts to generate printable course graphs for each student."}
        </p>

        {uploadMode === "single" ? (
          /* Single PDF Dropzone */
          <div
            className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-gray-400 bg-slate-50/50"
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
              aria-hidden="true"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="mt-4">
              <label
                htmlFor="file-upload-single"
                className="cursor-pointer text-blue-600 hover:text-blue-500 font-semibold text-sm"
              >
                Click to upload PDF
              </label>
              <span className="text-gray-600 text-sm"> or drag and drop</span>
              <input
                id="file-upload-single"
                type="file"
                className="sr-only"
                accept=".pdf"
                onChange={handleSingleFileChange}
                disabled={loading}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">PDF files up to 10MB</p>
          </div>
        ) : (
          /* Batch Dropzone & Pickers */
          <div className="space-y-4">
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400 bg-slate-50/50"
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <svg
                className="mx-auto h-12 w-12 text-blue-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <div className="mt-3">
                <span className="text-sm font-semibold text-gray-800">
                  Drag & Drop a Folder or ZIP archive
                </span>
                <p className="text-xs text-gray-500 mt-1">
                  Or use one of the quick selection options below
                </p>
              </div>

              {/* Hidden File Inputs */}
              <input
                ref={zipInputRef}
                type="file"
                className="sr-only"
                accept=".zip"
                onChange={handleZipChange}
                disabled={loading}
              />
              <input
                ref={folderInputRef}
                type="file"
                className="sr-only"
                // @ts-expect-error webkitdirectory is standard in all modern browsers
                webkitdirectory=""
                directory=""
                multiple
                onChange={handleFolderChange}
                disabled={loading}
              />
              <input
                ref={multiPdfInputRef}
                type="file"
                className="sr-only"
                accept=".pdf"
                multiple
                onChange={handleMultiPdfChange}
                disabled={loading}
              />

              {/* Quick Select Buttons */}
              <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => zipInputRef.current?.click()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  📦 Select ZIP File
                </button>
                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  📁 Select Folder
                </button>
                <button
                  type="button"
                  onClick={() => multiPdfInputRef.current?.click()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 cursor-pointer disabled:opacity-50"
                >
                  📑 Multiple PDFs
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
            {error}
          </div>
        )}

        {/* Selected file preview */}
        {uploadMode === "single" && singleFile && (
          <div className="mt-4 p-3.5 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-800 font-semibold">{singleFile.name}</p>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {(singleFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSingleFile(null)}
              className="text-xs text-red-600 hover:text-red-800 font-medium"
            >
              Remove
            </button>
          </div>
        )}

        {uploadMode === "batch" && batchFiles.length > 0 && (
          <div className="mt-4 p-3.5 bg-blue-50/70 border border-blue-200 rounded-lg flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-950 font-bold">{batchSourceLabel}</p>
              <p className="text-[11px] text-blue-700 mt-0.5">
                Ready to parse and generate printable course graphs
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setBatchFiles([]);
                setBatchSourceLabel("");
              }}
              disabled={loading}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium"
            >
              Clear
            </button>
          </div>
        )}

        {/* Department Override Selection */}
        <div className="mt-5">
          <label
            htmlFor="department-select"
            className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1"
          >
            Department Plan
          </label>
          <select
            id="department-select"
            value={department}
            onChange={(e) => setDepartment(e.target.value as Department | "")}
            disabled={loading}
            className="w-full border border-gray-300 rounded-lg py-2 px-3 bg-white text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
          >
            <option value="" className="text-gray-900 bg-white">
              Auto-detect from transcript (Recommended)
            </option>
            {DEPARTMENTS.map((dept) => (
              <option key={dept} value={dept} className="text-gray-900 bg-white">
                {DEPARTMENT_NAMES[dept]} ({dept})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-gray-500 mt-1">
            {uploadMode === "single"
              ? "Optionally override the department detected from the PDF."
              : "Set a common department override for all transcripts in this batch (or leave auto-detect)."}
          </p>
        </div>

        {/* Progress Display */}
        {loading && batchProgress && (
          <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold text-slate-800">
                {batchProgress.phase === "extracting"
                  ? "Extracting files..."
                  : `Processing ${batchProgress.current} of ${batchProgress.total} transcripts`}
              </span>
              {batchProgress.total > 0 && (
                <span className="font-mono text-slate-500 font-bold">
                  {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                </span>
              )}
            </div>

            {/* Progress Bar */}
            <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-200"
                style={{
                  width:
                    batchProgress.total > 0
                      ? `${(batchProgress.current / batchProgress.total) * 100}%`
                      : "100%",
                }}
              />
            </div>

            <p className="mt-2 text-[11px] text-slate-500 truncate">
              {batchProgress.currentFileName}
            </p>
          </div>
        )}

        {/* Submit Action */}
        <button
          onClick={handleSubmit}
          disabled={
            loading ||
            (uploadMode === "single" && !singleFile) ||
            (uploadMode === "batch" && batchFiles.length === 0)
          }
          className="mt-6 w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-semibold text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {loading
            ? "Analyzing Transcripts..."
            : uploadMode === "single"
            ? "Continue to Advising Report"
            : `Process Batch Transcripts`}
        </button>
      </div>
    </div>
  );
}
