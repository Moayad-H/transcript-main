"use client";

import { useCallback, useState } from "react";
import { validateFile } from "@/lib/utils/fileValidation";

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  loading: boolean;
}

export function FileUpload({ onFileUpload, loading }: FileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    setError(null);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      const validation = validateFile(files[0]);
      if (!validation.valid) {
        setError(validation.error || "Invalid file");
        return;
      }
      setSelectedFile(files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    setError(null);

    const files = e.target.files;
    if (files && files[0]) {
      const validation = validateFile(files[0]);
      if (!validation.valid) {
        setError(validation.error || "Invalid file");
        return;
      }
      setSelectedFile(files[0]);
    }
  };

  const handleSubmit = () => {
    if (selectedFile) {
      onFileUpload(selectedFile);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Upload Student Transcript
        </h2>
        <p className="text-gray-600 mb-6">
          Upload a PDF transcript to analyze courses and generate academic
          advising report
        </p>

        <div
          className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
            dragActive
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
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
              htmlFor="file-upload"
              className="cursor-pointer text-blue-600 hover:text-blue-500 font-medium"
            >
              Click to upload
            </label>
            <span className="text-gray-600"> or drag and drop</span>
            <input
              id="file-upload"
              type="file"
              className="sr-only"
              accept=".pdf"
              onChange={handleChange}
              disabled={loading}
            />
          </div>
          <p className="text-sm text-gray-500 mt-2">PDF files up to 10MB</p>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {error}
          </div>
        )}

        {selectedFile && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700">
              <span className="font-medium">Selected file:</span>{" "}
              {selectedFile.name}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Size: {(selectedFile.size / 1024).toFixed(2)} KB
            </p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={!selectedFile || loading}
          className="mt-6 w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Processing..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
