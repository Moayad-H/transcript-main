"use client";

import { ReactNode, useState } from "react";

interface RegisterSectionProps {
  /** Section letter + title, e.g. "A · Recommended This Semester". */
  label: string;
  /** Count shown next to the label. */
  count: number;
  /** Tailwind text color for the label (matches the old per-section tone). */
  labelClassName: string;
  /** Trailing note after the count, e.g. "· 2 slots left". */
  note?: ReactNode;
  /** Draw a top divider (used for every section after the first). */
  divider?: boolean;
  /** Start expanded (section A defaults open — it's the actual recommendation). */
  defaultExpanded?: boolean;
  children: ReactNode;
}

/**
 * One collapsible section of the "Courses You Can Register" card, mirroring the
 * expand/collapse behavior of RequirementRow. Print always renders expanded so
 * paper never hides the detail.
 */
export function RegisterSection({
  label,
  count,
  labelClassName,
  note,
  divider,
  defaultExpanded = false,
  children,
}: RegisterSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className={divider ? "mt-1 border-t border-slate-100 pt-1" : ""}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center gap-1 py-1 text-left"
      >
        <span
          className={`text-[10px] text-slate-400 transition-transform ${
            expanded ? "rotate-90" : ""
          }`}
          aria-hidden
        >
          ▶
        </span>
        <span
          className={`text-[10px] font-semibold uppercase tracking-wide ${labelClassName}`}
        >
          {label}
          <span className="ml-1 font-normal normal-case text-slate-400">
            ({count}){note}
          </span>
        </span>
      </button>

      <div className={`${expanded ? "" : "hidden"} print:block`}>{children}</div>
    </div>
  );
}
