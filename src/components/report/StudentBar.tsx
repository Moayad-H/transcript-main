import { AnalysisReport } from "@/types";

interface StudentBarProps {
  report: AnalysisReport;
  view: "report" | "graph";
  onViewChange: (view: "report" | "graph") => void;
  onBack: () => void;
  onPrint: () => void;
  onDownload: () => void;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-blue-200">{label}</span>
      <span
        className={`text-sm font-bold ${
          tone === "warn" ? "text-red-300" : tone === "ok" ? "text-green-300" : "text-white"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The one always-visible row: who the student is and the four numbers an
 * advisor asks for first. Replaces the old full-page report header so the board
 * below it gets the vertical space.
 */
export function StudentBar({
  report,
  view,
  onViewChange,
  onBack,
  onPrint,
  onDownload,
}: StudentBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-brand px-4 py-3 text-white print:rounded-none">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-md font-bold">{report.studentName}</h1>
          <span className="rounded bg-white/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
            {report.department}
          </span>
        </div>
        <h3 className="truncate text-sm font-bold">Student ID: {report.studentID}</h3>
        <p className="text-[11px] text-blue-200">
          Academic Advising Report · CCIT
          {report.latestSemester ? ` · ${report.latestSemester.label}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {report.gpa !== null && (
          <Stat
            label="G.P.A"
            value={String(report.gpa)}
            tone={report.onProbation ? "warn" : undefined}
          />
        )}
        <Stat label="Credit Hours" value={`${report.totalCreditHours} / 132`} />
        <Stat label="Expected" value={`${report.expectedCreditHours} Cr.`} />
        <Stat
          label="To Graduate"
          value={
            report.graduationCreditRequirementMet
              ? "132 Cr. met"
              : `${report.creditHoursToGraduation} Cr. left`
          }
          tone={report.graduationEligible ? "ok" : undefined}
        />
        <Stat label="Completed" value={`${report.completedCourses} courses`} />
      </div>

      <div className="ml-auto flex flex-wrap items-center justify-end gap-2 print:hidden">
        <div className="flex rounded-lg bg-white/10 p-0.5 text-sm">
          <button
            onClick={() => onViewChange("report")}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              view === "report" ? "bg-white text-brand" : "text-blue-100 hover:text-white"
            }`}
          >
            Report
          </button>
          <button
            onClick={() => onViewChange("graph")}
            className={`rounded-md px-3 py-1 font-medium transition-colors ${
              view === "graph" ? "bg-white text-brand" : "text-blue-100 hover:text-white"
            }`}
          >
            Course Graph
          </button>
        </div>
        <button
          onClick={onPrint}
          title="Print report"
          className="rounded-lg border border-white/25 px-3 py-1.5 text-sm text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
        >
          Print
        </button>
        <button
          onClick={onDownload}
          title="Download report as text"
          className="rounded-lg border border-white/25 px-3 py-1.5 text-sm text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
        >
          Download
        </button>
        <button
          onClick={onBack}
          className="rounded-lg border border-white/25 px-3 py-1.5 text-sm text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
        >
          New Analysis
        </button>
      </div>
    </div>
  );
}
