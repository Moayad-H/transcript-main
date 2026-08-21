import { CardTone, toneChip } from "./DashCard";

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
}: CourseRowProps) {
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
    </li>
  );
}

