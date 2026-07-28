import { ReactNode } from "react";

/**
 * Semantic tone of a dashboard card. Colour carries meaning here — red is
 * always "something is wrong", amber "needs attention", green "done" — so the
 * advisor can triage the board without reading a word.
 */
export type CardTone =
  | "navy"
  | "blue"
  | "amber"
  | "orange"
  | "red"
  | "green"
  | "purple"
  | "indigo"
  | "teal"
  | "cyan"
  | "violet"
  | "slate";

const TONES: Record<CardTone, { dot: string; badge: string; chip: string }> = {
  navy: { dot: "bg-brand", badge: "bg-brand text-white", chip: "bg-slate-100 text-slate-700" },
  blue: { dot: "bg-blue-500", badge: "bg-blue-100 text-blue-800", chip: "bg-blue-50 text-blue-800" },
  amber: { dot: "bg-amber-500", badge: "bg-amber-100 text-amber-800", chip: "bg-amber-50 text-amber-800" },
  orange: { dot: "bg-orange-500", badge: "bg-orange-100 text-orange-800", chip: "bg-orange-50 text-orange-800" },
  red: { dot: "bg-red-500", badge: "bg-red-100 text-red-800", chip: "bg-red-50 text-red-800" },
  green: { dot: "bg-green-500", badge: "bg-green-100 text-green-800", chip: "bg-green-50 text-green-800" },
  purple: { dot: "bg-purple-500", badge: "bg-purple-100 text-purple-800", chip: "bg-purple-50 text-purple-800" },
  indigo: { dot: "bg-indigo-500", badge: "bg-indigo-100 text-indigo-800", chip: "bg-indigo-50 text-indigo-800" },
  teal: { dot: "bg-teal-500", badge: "bg-teal-100 text-teal-800", chip: "bg-teal-50 text-teal-800" },
  cyan: { dot: "bg-cyan-500", badge: "bg-cyan-100 text-cyan-800", chip: "bg-cyan-50 text-cyan-800" },
  violet: { dot: "bg-violet-500", badge: "bg-violet-100 text-violet-800", chip: "bg-violet-50 text-violet-800" },
  slate: { dot: "bg-slate-400", badge: "bg-slate-200 text-slate-700", chip: "bg-slate-100 text-slate-700" },
};

export function toneChip(tone: CardTone): string {
  return TONES[tone].chip;
}

interface DashCardProps {
  title: string;
  tone?: CardTone;
  badge?: string | number;
  /** Extra controls rendered at the right of the card header. */
  actions?: ReactNode;
  children: ReactNode;
  /** Grid placement / sizing classes supplied by the board. */
  className?: string;
  /**
   * Body scrolls inside the card instead of growing the page. This is the whole
   * point of the cockpit: the board never scrolls, individual cards do.
   */
  scroll?: boolean;
}

export function DashCard({
  title,
  tone = "slate",
  badge,
  actions,
  children,
  className = "",
  scroll = true,
}: DashCardProps) {
  const t = TONES[tone];

  return (
    <section
      className={`flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:h-auto print:break-inside-avoid print:overflow-visible ${className}`}
    >
      <header className="flex flex-shrink-0 items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${t.dot}`} aria-hidden="true" />
        <h3 className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-600">
          {title}
        </h3>
        {badge !== undefined && (
          <span
            className={`ml-auto flex-shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${t.badge}`}
          >
            {badge}
          </span>
        )}
        {actions && <div className="ml-auto flex-shrink-0">{actions}</div>}
      </header>
      <div
        className={`min-h-0 flex-1 px-3 py-2 print:overflow-visible ${
          scroll ? "overflow-y-auto" : ""
        }`}
      >
        {children}
      </div>
    </section>
  );
}

/** Consistent empty state — an empty card must still say why it is empty. */
export function CardEmpty({ children }: { children: ReactNode }) {
  return <p className="py-1 text-sm italic text-slate-400">{children}</p>;
}
