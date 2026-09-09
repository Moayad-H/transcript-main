import { AnalysisReport, Department } from "@/types";
import { DEPARTMENTS, DEPARTMENT_NAMES } from "@/lib/constants";

interface StudentBarProps {
  report: AnalysisReport;
  view: "report" | "graph";
  onViewChange: (view: "report" | "graph") => void;
  onBack: () => void;
  onPrint: () => void;
  onDepartmentChange?: (department: Department) => void;
  onOpenSchedule?: () => void;
}


function Stat({ label, value, tone }: { label: string; value: string; tone?: "warn" | "ok" | "amber" }) {
  return (
    <div className="flex flex-col leading-tight">
      <span className="text-[10px] uppercase tracking-wider text-blue-200">{label}</span>
      <span
        className={`text-sm font-bold ${
          tone === "warn"
            ? "text-red-300"
            : tone === "ok"
            ? "text-green-300"
            : tone === "amber"
            ? "text-amber-300"
            : "text-white"
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
  onDepartmentChange,
  onOpenSchedule,
}: StudentBarProps) {

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-brand px-4 py-3 text-white print:rounded-none shrink-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-md font-bold">{report.studentName}</h1>
          <div className="flex items-center gap-1">
            <select
              value={report.department}
              onChange={(e) => onDepartmentChange?.(e.target.value as Department)}
              className="rounded bg-white/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white border border-white/30 cursor-pointer hover:bg-white/30 focus:outline-none focus:ring-1 focus:ring-white transition-colors print:hidden"
              title="Change student department plan"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d} className="text-slate-900 bg-white font-medium">
                  {d} · {DEPARTMENT_NAMES[d]}
                </option>
              ))}
            </select>
            <span className="hidden print:inline-block rounded bg-white/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
              {report.department}
            </span>
          </div>
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
        {report.ungradedCourses.length > 0 && (
          <Stat
            label="In Progress"
            value={`${report.ungradedCourses.length} (${report.expectedCreditHours - report.totalCreditHours} Cr)`}
            tone="amber"
          />
        )}
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

        {onOpenSchedule && (
          <button
            onClick={onOpenSchedule}
            title="Find course timetable schedule"
            className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-sm font-semibold text-white shadow-2xs transition-colors hover:bg-white/25"
          >
            <span>📅</span>
            <span>Schedule</span>
          </button>
        )}

        <button
          onClick={onPrint}
          title="Print report"
          className="rounded-lg border border-white/25 px-3 py-1.5 text-sm text-blue-100 transition-colors hover:bg-white/10 hover:text-white"
        >
          Print
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
