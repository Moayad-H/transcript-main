import { AnalysisReport } from "@/types";
import { ElectiveCourse } from "@/types/course";
import { CardTone, DashCard, toneChip } from "./DashCard";

interface RequirementRowProps {
  label: string;
  completed: ElectiveCourse[];
  ungraded: ElectiveCourse[];
  remaining: number;
  tone: CardTone;
}

const BAR: Record<string, { done: string; pending: string }> = {
  purple: { done: "bg-purple-500", pending: "bg-purple-300" },
  green: { done: "bg-green-500", pending: "bg-green-300" },
  indigo: { done: "bg-indigo-500", pending: "bg-indigo-300" },
  orange: { done: "bg-orange-500", pending: "bg-orange-300" },
  teal: { done: "bg-teal-500", pending: "bg-teal-300" },
};

function RequirementRow({
  label,
  completed,
  ungraded,
  remaining,
  tone,
}: RequirementRowProps) {
  const total = completed.length + remaining;
  const bar = BAR[tone] ?? BAR.indigo;
  const donePct = total > 0 ? (completed.length / total) * 100 : 100;
  const pendingPct =
    total > 0 ? (Math.min(ungraded.length, remaining) / total) * 100 : 0;

  return (
    <div className="border-b border-slate-100 py-2 last:border-0">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">{label}</span>
        <span
          className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${
            remaining === 0 ? "bg-green-100 text-green-800" : toneChip(tone)
          }`}
        >
          {completed.length}/{total}
        </span>
      </div>

      {/* Solid = passed, lighter = registered but not yet graded. */}
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={bar.done} style={{ width: `${donePct}%` }} />
        <div className={bar.pending} style={{ width: `${pendingPct}%` }} />
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {completed.map((course) => (
          <span
            key={`c-${course.code}`}
            title={course.title}
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${toneChip(tone)}`}
          >
            {course.code}
          </span>
        ))}
        {ungraded.map((course) => (
          <span
            key={`u-${course.code}`}
            title={`${course.title} — grade pending`}
            className="rounded border border-dashed border-slate-300 px-1.5 py-0.5 font-mono text-[10px] text-slate-500"
          >
            {course.code}
          </span>
        ))}
        {remaining > 0 && (
          <span className="rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-500">
            {remaining} to choose
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Every "N of M done" requirement on one card: three elective categories plus
 * the two training courses. Previously five separate full-width sections that
 * together made up most of the old page's scroll length.
 */
export function RequirementsCard({
  report,
  className,
}: {
  report: AnalysisReport;
  className?: string;
}) {
  const outstanding =
    report.remainingMajorElectives +
    report.remainingScienceElectives +
    report.remainingUniversityRequirements +
    report.remainingProfessionalTraining +
    (report.practicalTrainingCompleted ? 0 : 1);

  const practicalStatus = report.practicalTrainingCompleted
    ? { label: "Completed", tone: "bg-green-100 text-green-800" }
    : report.practicalTrainingUngraded
    ? { label: "In progress", tone: "bg-yellow-100 text-yellow-800" }
    : report.practicalTrainingEligible
    ? { label: "Available now", tone: "bg-blue-100 text-blue-800" }
    : { label: "Not yet eligible", tone: "bg-slate-200 text-slate-700" };

  return (
    <DashCard
      title="Degree Requirements"
      tone={outstanding === 0 ? "green" : "purple"}
      badge={outstanding === 0 ? "All met" : `${outstanding} left`}
      className={className}
    >
      <RequirementRow
        label="Major Electives"
        completed={report.completedMajorElectives}
        ungraded={report.ungradedMajorElectives}
        remaining={report.remainingMajorElectives}
        tone="purple"
      />
      <RequirementRow
        label="Science Electives"
        completed={report.completedScienceElectives}
        ungraded={report.ungradedScienceElectives}
        remaining={report.remainingScienceElectives}
        tone="green"
      />
      <RequirementRow
        label="University Requirements"
        completed={report.completedUniversityRequirements}
        ungraded={report.ungradedUniversityRequirements}
        remaining={report.remainingUniversityRequirements}
        tone="indigo"
      />

      {/* Professional Training rows carry no course code — the plan lists them
          by title only — so they render as plain text rather than code chips. */}
      <div className="border-b border-slate-100 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">
            Professional Training
          </span>
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${
              report.remainingProfessionalTraining === 0
                ? "bg-green-100 text-green-800"
                : "bg-orange-100 text-orange-800"
            }`}
          >
            {report.completedProfessionalTraining.length}/
            {report.completedProfessionalTraining.length +
              report.remainingProfessionalTraining}
          </span>
        </div>
        {report.completedProfessionalTraining.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {report.completedProfessionalTraining.map((course, idx) => (
              <li key={idx} className="truncate text-xs text-slate-600" title={course}>
                {course}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-slate-700">
            Practical Training
          </span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
            CIT4000
          </span>
          <span
            className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${practicalStatus.tone}`}
          >
            {practicalStatus.label}
          </span>
        </div>
        {!report.practicalTrainingCompleted &&
          !report.practicalTrainingUngraded &&
          !report.practicalTrainingEligible && (
            <p className="mt-1 text-xs text-slate-500">
              Requires 90 credit hours to register (student has{" "}
              {report.totalCreditHours}).
            </p>
          )}
      </div>
    </DashCard>
  );
}
