"use client";

import { useMemo } from "react";
import {
  ScheduleSolution,
  SCHEDULE_PERIODS,
  SCHEDULE_DAYS,
  DayOfWeek,
  PeriodNumber,
} from "@/types/schedule";

interface TimetableGridProps {
  solution: ScheduleSolution;
  className?: string;
}

// Curated distinct color palettes for scheduled courses
const COURSE_PALETTES = [
  { bg: "bg-blue-50 hover:bg-blue-100", border: "border-blue-200", text: "text-blue-900", badge: "bg-blue-100 text-blue-700" },
  { bg: "bg-emerald-50 hover:bg-emerald-100", border: "border-emerald-200", text: "text-emerald-900", badge: "bg-emerald-100 text-emerald-700" },
  { bg: "bg-purple-50 hover:bg-purple-100", border: "border-purple-200", text: "text-purple-900", badge: "bg-purple-100 text-purple-700" },
  { bg: "bg-amber-50 hover:bg-amber-100", border: "border-amber-200", text: "text-amber-900", badge: "bg-amber-100 text-amber-700" },
  { bg: "bg-rose-50 hover:bg-rose-100", border: "border-rose-200", text: "text-rose-900", badge: "bg-rose-100 text-rose-700" },
  { bg: "bg-cyan-50 hover:bg-cyan-100", border: "border-cyan-200", text: "text-cyan-900", badge: "bg-cyan-100 text-cyan-700" },
  { bg: "bg-indigo-50 hover:bg-indigo-100", border: "border-indigo-200", text: "text-indigo-900", badge: "bg-indigo-100 text-indigo-700" },
  { bg: "bg-teal-50 hover:bg-teal-100", border: "border-teal-200", text: "text-teal-900", badge: "bg-teal-100 text-teal-700" },
];

export function TimetableGrid({ solution, className = "" }: TimetableGridProps) {
  // Map course codes to color palette
  const courseColors = useMemo(() => {
    const map = new Map<string, typeof COURSE_PALETTES[0]>();
    let idx = 0;
    for (const as of solution.assignments) {
      if (!map.has(as.courseCode)) {
        map.set(as.courseCode, COURSE_PALETTES[idx % COURSE_PALETTES.length]);
        idx++;
      }
    }
    return map;
  }, [solution.assignments]);

  // Build a grid map: key `${day}_${period}` -> array of courses occupying this cell
  const gridCells = useMemo(() => {
    const map = new Map<string, {
      courseCode: string;
      courseTitle: string;
      assignedGroup: string;
      isAlternative: boolean;
      hasConflict: boolean;
    }[]>();

    for (const as of solution.assignments) {
      for (const slot of as.slots) {
        const key = `${slot.day}_${slot.period}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({
          courseCode: as.courseCode,
          courseTitle: as.courseTitle,
          assignedGroup: as.assignedGroup,
          isAlternative: as.isAlternativeGroup,
          hasConflict: !!as.conflictWith && as.conflictWith.length > 0,
        });
      }
    }
    return map;
  }, [solution.assignments]);

  return (
    <div className={`overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      <table className="w-full border-collapse text-left text-xs">
        {/* Table Header: Periods & Timings */}
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
            <th className="w-20 border-r border-slate-200 p-2.5 text-center font-bold uppercase tracking-wider text-slate-500">
              Day / Period
            </th>
            {SCHEDULE_PERIODS.map((p) => (
              <th
                key={p.period}
                className="border-r border-slate-200 p-2 text-center last:border-r-0 min-w-[130px]"
              >
                <div className="font-bold text-slate-800">Period {p.label}</div>
                <div className="text-[10px] font-medium text-slate-500">{p.timeRange}</div>
              </th>
            ))}
          </tr>
        </thead>

        {/* Table Body: Days & Scheduled Courses */}
        <tbody className="divide-y divide-slate-200">
          {SCHEDULE_DAYS.map((day) => (
            <tr key={day.day} className="transition-colors hover:bg-slate-50/50">
              {/* Day column */}
              <td className="border-r border-slate-200 bg-slate-50/70 p-2 text-center font-bold text-slate-800">
                <div className="text-sm">{day.label}</div>
                <div className="text-[10px] font-normal text-slate-500">{day.full}</div>
              </td>

              {/* 6 Period Columns */}
              {SCHEDULE_PERIODS.map((period) => {
                const key = `${day.day}_${period.period}`;
                const occupants = gridCells.get(key) || [];
                const isConflictCell = occupants.length > 1;

                return (
                  <td
                    key={period.period}
                    className={`border-r border-slate-200 p-1.5 align-top last:border-r-0 h-24 ${
                      isConflictCell ? "bg-red-50/60 ring-2 ring-inset ring-red-400" : ""
                    }`}
                  >
                    {occupants.length === 0 ? (
                      <div className="h-full w-full rounded border border-dashed border-slate-100" />
                    ) : (
                      <div className="flex flex-col gap-1">
                        {occupants.map((occ, idx) => {
                          const palette = courseColors.get(occ.courseCode) || COURSE_PALETTES[0];
                          return (
                            <div
                              key={`${occ.courseCode}_${idx}`}
                              className={`rounded-lg border p-1.5 shadow-xs transition-all ${
                                occ.hasConflict || isConflictCell
                                  ? "border-red-300 bg-red-50 text-red-900"
                                  : `${palette.bg} ${palette.border} ${palette.text}`
                              }`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-mono font-bold text-xs">
                                  {occ.courseCode}
                                </span>
                                <span
                                  className={`rounded px-1 py-0.2 text-[9px] font-bold ${
                                    occ.isAlternative
                                      ? "bg-amber-100 text-amber-800 border border-amber-200"
                                      : palette.badge
                                  }`}
                                  title={
                                    occ.isAlternative
                                      ? `Alternative Group: ${occ.assignedGroup}`
                                      : `Base Group: ${occ.assignedGroup}`
                                  }
                                >
                                  {occ.assignedGroup}
                                </span>
                              </div>
                              <div className="line-clamp-2 mt-0.5 text-[10px] leading-tight opacity-90">
                                {occ.courseTitle}
                              </div>
                              {(occ.hasConflict || isConflictCell) && (
                                <div className="mt-1 flex items-center gap-1 text-[9px] font-bold text-red-600">
                                  <span>⚠️ Conflict</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
