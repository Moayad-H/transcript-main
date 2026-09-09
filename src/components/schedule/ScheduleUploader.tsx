"use client";

import { useState } from "react";
import { GroupSchedule } from "@/types/schedule";
import { parseSchedulePDF } from "@/lib/analysis/scheduleParser";
import {
  saveCustomSchedules,
  clearCustomSchedules,
  loadCustomSchedules,
} from "@/lib/analysis/scheduleLoader";
import { logAdvisorAction } from "@/lib/logging/auditLogger";

interface ScheduleUploaderProps {
  onSchedulesUpdated: () => void;
  onClose: () => void;
}

export function ScheduleUploader({ onSchedulesUpdated, onClose }: ScheduleUploaderProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [customCount, setCustomCount] = useState<number>(() => loadCustomSchedules().length);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const allExtracted: GroupSchedule[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.name.toLowerCase().endsWith(".pdf")) continue;

        const buffer = await file.arrayBuffer();
        const groups = await parseSchedulePDF(buffer);
        allExtracted.push(...groups);
      }

      if (allExtracted.length === 0) {
        throw new Error("No timetable group tables were recognized in the uploaded PDF(s).");
      }

      // Merge with existing custom schedules
      const existing = loadCustomSchedules();
      const groupMap = new Map<string, GroupSchedule>();
      for (const g of existing) groupMap.set(g.groupName.toUpperCase(), g);
      for (const g of allExtracted) groupMap.set(g.groupName.toUpperCase(), g);

      const merged = Array.from(groupMap.values());
      saveCustomSchedules(merged);
      setCustomCount(merged.length);
      setSuccessMsg(`Successfully parsed and saved ${allExtracted.length} timetable group(s)!`);
      
      logAdvisorAction({
        action: "SCHEDULE_UPLOADED",
        metadata: {
          fileCount: files.length,
          fileNames: Array.from(files).map((f) => f.name),
          extractedGroupsCount: allExtracted.length,
          totalStoredCustomGroups: merged.length,
          groupNames: Array.from(new Set(allExtracted.map((g) => g.groupName))),
        },
      });

      onSchedulesUpdated();
    } catch (err: unknown) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Failed to parse schedule PDF");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    const prevCount = customCount;
    clearCustomSchedules();
    setCustomCount(0);
    setSuccessMsg("Reverted to default semester schedules.");
    
    logAdvisorAction({
      action: "SCHEDULE_RESET",
      metadata: {
        previousCustomCount: prevCount,
      },
    });

    onSchedulesUpdated();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h3 className="text-base font-bold text-slate-800">Upload Semester Schedules</h3>
        <p className="text-xs text-slate-500 mt-0.5">
          Upload College of Computing timetable PDF files containing group schedules.
        </p>
      </div>

      {/* File Dropzone / Input */}
      <div className="relative rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 text-center hover:bg-slate-50 transition-colors">
        <input
          type="file"
          accept=".pdf"
          multiple
          disabled={loading}
          onChange={handleFileUpload}
          className="absolute inset-0 cursor-pointer opacity-0"
          id="schedule-pdf-input"
        />
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <div className="text-xs font-semibold text-slate-700">
            {loading ? "Parsing Timetable PDF..." : "Click or drag & drop schedule PDF(s) here"}
          </div>
          <p className="text-[11px] text-slate-500">
            Supports multi-page PDFs containing group timetables (e.g. 2CS1, 3CS2, 5SE1)
          </p>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200">
          ⚠️ {error}
        </div>
      )}

      {successMsg && (
        <div className="rounded-lg bg-green-50 p-2.5 text-xs text-green-700 border border-green-200">
          ✅ {successMsg}
        </div>
      )}

      {/* Footer controls */}
      <div className="flex items-center justify-between border-t border-slate-200 pt-3 text-xs">
        <div className="text-slate-500">
          {customCount > 0 ? (
            <span>
              <strong>{customCount}</strong> custom group(s) stored in browser
            </span>
          ) : (
            <span>Using <strong>bundled default</strong> semester schedules (46 groups)</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {customCount > 0 && (
            <button
              onClick={handleReset}
              className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Reset to Defaults
            </button>
          )}
          <button
            onClick={onClose}
            className="rounded-lg bg-brand px-4 py-1.5 font-medium text-white hover:bg-brand/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
