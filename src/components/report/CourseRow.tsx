import { useState } from "react";
import { CardTone, toneChip } from "./DashCard";
import { CourseRecommendationReason } from "@/types";

interface CourseRowProps {
  code?: string;
  title: string;
  /** Secondary text — usually the semester the course was taken in. */
  meta?: string;
  /** Prerequisite or explanation note shown under the row. */
  subtext?: string;
  /** Right-aligned emphasis, e.g. the grade. */
  tag?: string;
  tagTone?: CardTone;
  tone?: CardTone;
  /** Explicit credit hours (e.g., 2 or 3). */
  credits?: number;
  /** Context badge e.g. "Sem 4 Core", "Major Elective". */
  badge?: string;
  badgeTone?: CardTone;
  /** Interactive selection for the live semester planner/basket. */
  selectable?: boolean;
  selected?: boolean;
  onToggle?: () => void;
  /** Detailed recommendation reasoning, expandable by the user */
  recommendationReason?: CourseRecommendationReason;
}

/**
 * Dense course row with optional interactive checkbox, credit hours pill,
 * context tags, code, title, and metadata.
 */
export function CourseRow({
  code,
  title,
  meta,
  subtext,
  tag,
  tagTone = "slate",
  tone = "slate",
  credits,
  badge,
  badgeTone = "slate",
  selectable,
  selected = false,
  onToggle,
  recommendationReason,
}: CourseRowProps) {
  const [isReasonExpanded, setIsReasonExpanded] = useState(false);
  return (
    <li
      className={`border-b border-slate-100 py-1.5 last:border-0 transition-colors ${
        selectable ? "cursor-pointer rounded-lg px-1.5 hover:bg-slate-50" : ""
      } ${selected && selectable ? "bg-blue-50/60" : ""}`}
      onClick={selectable && onToggle ? onToggle : undefined}
    >
      <div className="flex items-center gap-2">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle ?? (() => {})}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${title}`}
            className="h-3.5 w-3.5 rounded border-slate-300 text-brand focus:ring-brand"
          />
        )}

        {code && (
          <span
            className={`flex-shrink-0 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium ${toneChip(
              tone
            )}`}
          >
            {code}
          </span>
        )}

        <span
          className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700"
          title={title}
        >
          {title}
        </span>

        {badge && (
          <span
            className={`hidden sm:inline-flex flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${toneChip(
              badgeTone
            )}`}
          >
            {badge}
          </span>
        )}

        {credits !== undefined && (
          <span className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
            {credits} Cr
          </span>
        )}

        {recommendationReason && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsReasonExpanded((prev) => !prev);
            }}
            className={`flex-shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
              isReasonExpanded
                ? "bg-blue-200 text-blue-900 font-bold"
                : "bg-blue-50 text-blue-700 hover:bg-blue-100"
            }`}
            title={isReasonExpanded ? "Hide recommendation rationale" : "Why was this course recommended?"}
            aria-expanded={isReasonExpanded}
          >
            <span>💡 Why?</span>
            <span
              className={`inline-block text-[8px] transition-transform duration-200 ${
                isReasonExpanded ? "rotate-180" : ""
              }`}
            >
              ▼
            </span>
          </button>
        )}

        {tag && (
          <span
            className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${toneChip(
              tagTone
            )}`}
          >
            {tag}
          </span>
        )}
      </div>

      {(meta || subtext) && (
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[10px]">
          {meta && <span className="text-slate-400">{meta}</span>}
          {subtext && <span className="text-slate-500 italic">{subtext}</span>}
        </div>
      )}

      {isReasonExpanded && recommendationReason && (
        <div
          className="mt-2 mb-1 rounded-lg border border-blue-200 bg-blue-50/70 p-2.5 text-xs text-slate-700 shadow-xs cursor-default"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start gap-2">
            <span className="text-sm select-none" aria-hidden>
              💡
            </span>
            <div className="flex-1 space-y-1.5 min-w-0">
              <p className="font-semibold text-blue-950 leading-snug">
                {recommendationReason.summary}
              </p>

              <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                {recommendationReason.planSemester && (
                  <span className="rounded bg-blue-100/90 px-1.5 py-0.5 font-medium text-blue-800">
                    📅 Semester {recommendationReason.planSemester} Plan
                  </span>
                )}

                {recommendationReason.isOverdue && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900">
                    ⚠️ Overdue Core
                  </span>
                )}

                {recommendationReason.priorityTier && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                    Tier {recommendationReason.priorityTier} Priority
                  </span>
                )}

                {recommendationReason.loadConstraint && (
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                    {recommendationReason.loadConstraint}
                  </span>
                )}
              </div>

              {recommendationReason.unlockedCourses &&
                recommendationReason.unlockedCourses.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-blue-200/60">
                    <span className="text-[10px] font-bold text-blue-900 uppercase tracking-wide">
                      Directly Unlocks {recommendationReason.unlockedCourses.length} Course
                      {recommendationReason.unlockedCourses.length === 1 ? "" : "s"}:
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {recommendationReason.unlockedCourses.map((uc, i) => (
                        <span
                          key={i}
                          className="rounded bg-white border border-blue-200 px-1.5 py-0.5 font-mono text-[10px] text-slate-800"
                          title={uc.title}
                        >
                          <strong className="text-blue-700">{uc.code}</strong>{" "}
                          <span className="text-slate-600 truncate max-w-[180px] inline-block align-bottom">
                            {uc.title}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

