import { CardTone, toneChip } from "./DashCard";

interface CourseRowProps {
  code?: string;
  title: string;
  /** Secondary text — usually the semester the course was taken in. */
  meta?: string;
  /** Right-aligned emphasis, e.g. the grade. */
  tag?: string;
  tagTone?: CardTone;
  tone?: CardTone;
}

/**
 * One dense course line: code, title and grade on the first line, the semester
 * demoted to a second. Columns are narrow, so the title gets the whole line
 * rather than competing with the semester label for it; it truncates instead of
 * wrapping so a fixed-height card always shows a predictable number of rows.
 */
export function CourseRow({
  code,
  title,
  meta,
  tag,
  tagTone = "slate",
  tone = "slate",
}: CourseRowProps) {
  return (
    <li className="border-b border-slate-100 py-1.5 last:border-0">
      <div className="flex items-center gap-2">
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
          className="min-w-0 flex-1 truncate text-sm text-slate-700"
          title={title}
        >
          {title}
        </span>
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
      {meta && (
        <p className="mt-0.5 truncate text-[10px] text-slate-400">{meta}</p>
      )}
    </li>
  );
}
