"use client";

import React, { useMemo, useState, useRef } from "react";
import { Department } from "@/types";
import { SavedStudentRecord, SavedStudentFilterOptions } from "@/types/savedStudent";

interface SavedStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: SavedStudentRecord[];
  onSelectStudent: (student: SavedStudentRecord) => void;
  onDeleteStudent: (studentId: string) => Promise<void>;
  onSync: () => Promise<void>;
  onExport: () => Promise<void>;
  onImport: (jsonString: string) => Promise<number>;
  isSyncing?: boolean;
  syncStatusMessage?: string | null;
  loading?: boolean;
}

export function SavedStudentsModal({
  isOpen,
  onClose,
  students,
  onSelectStudent,
  onDeleteStudent,
  onSync,
  onExport,
  onImport,
  isSyncing = false,
  syncStatusMessage = null,
  loading = false,
}: SavedStudentsModalProps) {
  const [filters, setFilters] = useState<SavedStudentFilterOptions>({
    searchQuery: "",
    department: "ALL",
    standing: "ALL",
    sortBy: "UPDATED_DESC",
  });

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredStudents = useMemo(() => {
    return students
      .filter((s) => {
        // Search query
        if (filters.searchQuery.trim()) {
          const q = filters.searchQuery.toLowerCase().trim();
          const matchName = s.studentName.toLowerCase().includes(q);
          const matchId = s.studentId.toLowerCase().includes(q);
          if (!matchName && !matchId) return false;
        }

        // Department
        if (filters.department !== "ALL" && s.department !== filters.department) {
          return false;
        }

        // Standing
        if (filters.standing === "PROBATION") {
          if (!s.onProbation && s.gpa >= 2.0) return false;
        } else if (filters.standing === "FAILED_COURSES") {
          if (s.failedCoursesCount === 0) return false;
        } else if (filters.standing === "GOOD_STANDING") {
          if (s.onProbation || s.gpa < 2.0 || s.failedCoursesCount > 0) return false;
        }

        return true;
      })
      .sort((a, b) => {
        switch (filters.sortBy) {
          case "UPDATED_DESC":
            return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
          case "NAME_ASC":
            return a.studentName.localeCompare(b.studentName);
          case "GPA_DESC":
            return b.gpa - a.gpa;
          case "GPA_ASC":
            return a.gpa - b.gpa;
          case "CREDITS_DESC":
            return b.totalCreditHours - a.totalCreditHours;
          default:
            return 0;
        }
      });
  }, [students, filters]);

  const handleDelete = async (e: React.MouseEvent, student: SavedStudentRecord) => {
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to remove ${student.studentName} (${student.studentId}) from your saved advisees?`)) {
      return;
    }
    setDeletingId(student.studentId);
    try {
      await onDeleteStudent(student.studentId);
    } finally {
      setDeletingId(null);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const count = await onImport(text);
      setImportMessage(`Successfully imported ${count} student record(s).`);
      setTimeout(() => setImportMessage(null), 4000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to import JSON file");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm text-lg">
              👥
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Advisee Roster
                </h2>
                <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
                  {students.length} Saved
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Instantly restore reports, prerequisite graphs, and schedule plans without re-parsing transcripts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Sync Button */}
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
              title="Sync with cloud database"
            >
              <span className={`text-sm ${isSyncing ? "animate-spin" : ""}`}>
                🔄
              </span>
              <span>{isSyncing ? "Syncing..." : "Sync Cloud"}</span>
            </button>

            {/* Export Button */}
            <button
              type="button"
              onClick={onExport}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-blue-700 transition-colors cursor-pointer"
              title="Download backup file of all saved students (.json)"
            >
              <span>💾</span>
              <span>Export</span>
            </button>

            {/* Import Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:text-blue-700 transition-colors cursor-pointer"
              title="Import saved students from JSON backup"
            >
              <span>📥</span>
              <span>Import</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileChange}
            />

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              className="ml-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer"
              title="Close"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Sync Status Banner */}
        {syncStatusMessage && (
          <div className="bg-blue-50 px-5 py-2 text-xs font-medium text-blue-800 border-b border-blue-100 flex items-center justify-between">
            <span>ℹ️ {syncStatusMessage}</span>
          </div>
        )}

        {/* Import Success Banner */}
        {importMessage && (
          <div className="bg-emerald-50 px-5 py-2 text-xs font-medium text-emerald-800 border-b border-emerald-100">
            ✅ {importMessage}
          </div>
        )}

        {/* Search & Filters Controls */}
        <div className="border-b border-slate-200 bg-white p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            {/* Search Input */}
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 text-sm">
                🔍
              </span>
              <input
                type="text"
                placeholder="Search advisee by name or student ID..."
                value={filters.searchQuery}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))
                }
                className="w-full rounded-xl border border-slate-300 bg-slate-50/50 pl-9 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition-all"
              />
              {filters.searchQuery && (
                <button
                  type="button"
                  onClick={() =>
                    setFilters((prev) => ({ ...prev, searchQuery: "" }))
                  }
                  className="absolute inset-y-0 right-3 flex items-center text-xs text-slate-400 hover:text-slate-600"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-slate-500">Sort:</span>
              <select
                value={filters.sortBy}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    sortBy: e.target.value as SavedStudentFilterOptions["sortBy"],
                  }))
                }
                className="rounded-xl border border-slate-300 bg-white px-2.5 py-2 text-xs font-medium text-slate-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer"
              >
                <option value="UPDATED_DESC">Recently Updated</option>
                <option value="GPA_DESC">Highest GPA</option>
                <option value="GPA_ASC">Lowest GPA</option>
                <option value="NAME_ASC">Name (A-Z)</option>
                <option value="CREDITS_DESC">Most Credits</option>
              </select>
            </div>
          </div>

          {/* Department & Standing Pills */}
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="font-semibold text-slate-500 mr-1">Major:</span>
            {(["ALL", "CS", "IS", "AI", "CY"] as const).map((dept) => (
              <button
                key={dept}
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    department: dept as Department | "ALL",
                  }))
                }
                className={`rounded-lg px-2.5 py-1 font-semibold transition-all cursor-pointer ${
                  filters.department === dept
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {dept}
              </button>
            ))}

            <div className="h-4 w-px bg-slate-200 mx-1 hidden sm:block" />

            <span className="font-semibold text-slate-500 mr-1">Status:</span>
            {(
              [
                { id: "ALL", label: "All" },
                { id: "GOOD_STANDING", label: "Good Standing" },
                { id: "PROBATION", label: "Probation" },
                { id: "FAILED_COURSES", label: "Has F Grades" },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    standing: st.id as SavedStudentFilterOptions["standing"],
                  }))
                }
                className={`rounded-lg px-2.5 py-1 font-semibold transition-all cursor-pointer ${
                  filters.standing === st.id
                    ? st.id === "PROBATION"
                      ? "bg-rose-600 text-white shadow-xs"
                      : st.id === "FAILED_COURSES"
                      ? "bg-amber-600 text-white shadow-xs"
                      : "bg-slate-800 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Student List Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50/50">
          {filteredStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="text-4xl mb-3">📁</span>
              <h3 className="text-sm font-bold text-slate-800">
                {students.length === 0
                  ? "No saved advisees yet"
                  : "No advisees match your search filters"}
              </h3>
              <p className="mt-1 max-w-sm text-xs text-slate-500">
                {students.length === 0
                  ? "Upload a student PDF transcript or batch zip. Every processed student is automatically saved to your roster."
                  : "Try loosening your search query or selecting 'All' majors and statuses."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredStudents.map((s) => {
                const isProbation = s.onProbation || s.gpa < 2.0;
                const isDeleting = deletingId === s.studentId;

                return (
                  <div
                    key={s.studentId}
                    onClick={() => !isDeleting && !loading && onSelectStudent(s)}
                    className="group relative flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs hover:border-blue-500 hover:shadow-md transition-all cursor-pointer"
                  >
                    <div>
                      {/* Top row: Name, Dept, and GPA */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-slate-900 text-sm truncate group-hover:text-blue-700 transition-colors">
                            {s.studentName}
                          </h4>
                          <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono text-slate-600 font-medium">
                              {s.studentId}
                            </span>
                            <span>•</span>
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 uppercase">
                              {s.department}
                            </span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`inline-block rounded-lg px-2 py-0.5 text-xs font-bold ${
                              isProbation
                                ? "bg-rose-100 text-rose-800"
                                : s.gpa >= 3.0
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            GPA {s.gpa.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Middle row: Badges & Credit info */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="rounded-md bg-slate-100 px-2 py-0.5 text-slate-700 font-medium">
                          {s.totalCreditHours} Earned Cr
                        </span>

                        {isProbation && (
                          <span className="rounded-md bg-rose-100 px-2 py-0.5 font-bold text-rose-800">
                            ⚠️ Academic Probation
                          </span>
                        )}

                        {s.failedCoursesCount > 0 && (
                          <span className="rounded-md bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                            {s.failedCoursesCount} Failed (F)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Bottom row: Updated timestamp & Action buttons */}
                    <div className="mt-3.5 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-400">
                      <span>
                        Updated: {new Date(s.updatedAt).toLocaleDateString()}
                      </span>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => handleDelete(e, s)}
                          disabled={isDeleting}
                          className="text-slate-400 hover:text-rose-600 font-medium px-1.5 py-0.5 rounded hover:bg-rose-50 transition-colors"
                          title="Delete student from saved roster"
                        >
                          {isDeleting ? "..." : "Delete"}
                        </button>
                        <span className="font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform">
                          Open Cockpit →
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="border-t border-slate-200 bg-slate-50 px-5 py-3 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>
            Showing {filteredStudents.length} of {students.length} students
          </span>
          <span className="text-[11px] text-slate-400">
            Encrypted & stored in local IndexedDB with Supabase cloud replication
          </span>
        </div>
      </div>
    </div>
  );
}
