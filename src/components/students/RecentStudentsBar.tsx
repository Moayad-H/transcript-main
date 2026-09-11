"use client";

import React from "react";
import { SavedStudentRecord } from "@/types/savedStudent";

interface RecentStudentsBarProps {
  students: SavedStudentRecord[];
  totalCount: number;
  onSelectStudent: (student: SavedStudentRecord) => void;
  onOpenFullModal: () => void;
  loading?: boolean;
}

export function RecentStudentsBar({
  students,
  totalCount,
  onSelectStudent,
  onOpenFullModal,
  loading = false,
}: RecentStudentsBarProps) {
  if (students.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur-sm transition-all hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 text-sm">
            👥
          </span>
          <div>
            <h3 className="text-sm font-bold text-slate-800">
              Recent Advisees
              <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
                {totalCount} saved
              </span>
            </h3>
            <p className="text-[11px] text-slate-500">
              Pick a student to load their full advising report and study plan instantly
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenFullModal}
          className="inline-flex items-center gap-1 text-xs font-bold text-blue-700 hover:text-blue-900 underline transition-colors cursor-pointer"
        >
          <span>View All ({totalCount})</span>
          <span>→</span>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
        {students.slice(0, 3).map((s) => {
          const isProbation = s.onProbation || s.gpa < 2.0;

          return (
            <button
              key={s.studentId}
              type="button"
              disabled={loading}
              onClick={() => onSelectStudent(s)}
              className="group flex items-center justify-between rounded-xl border border-slate-200/90 bg-slate-50/70 p-2.5 text-left transition-all hover:border-blue-400 hover:bg-blue-50/50 hover:shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <div className="min-w-0 flex-1 pr-2">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900 text-xs truncate group-hover:text-blue-700">
                    {s.studentName}
                  </span>
                  <span className="shrink-0 rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-700 uppercase">
                    {s.department}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <span className="font-mono">{s.studentId}</span>
                  <span>•</span>
                  <span>{s.totalCreditHours} Cr</span>
                  {s.failedCoursesCount > 0 && (
                    <>
                      <span>•</span>
                      <span className="font-semibold text-rose-600">
                        {s.failedCoursesCount} F
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="shrink-0 text-right">
                <span
                  className={`inline-block rounded-md px-1.5 py-0.5 text-xs font-bold ${
                    isProbation
                      ? "bg-rose-100 text-rose-800"
                      : s.gpa >= 3.0
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {s.gpa.toFixed(2)}
                </span>
                {isProbation && (
                  <span className="block text-[9px] font-bold text-rose-600">
                    Probation
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
