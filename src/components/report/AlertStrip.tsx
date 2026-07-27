"use client";

import { useState } from "react";
import { AnalysisReport } from "@/types";

type AlertTone = "danger" | "warn" | "ok" | "info" | "muted";

interface AlertItem {
  id: string;
  tone: AlertTone;
  label: string;
  detail: string;
}

const CHIP: Record<AlertTone, { idle: string; active: string; icon: string }> = {
  danger: {
    idle: "border-red-300 bg-red-50 text-red-800 hover:bg-red-100",
    active: "border-red-500 bg-red-600 text-white",
    icon: "⚠",
  },
  warn: {
    idle: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
    active: "border-amber-500 bg-amber-500 text-white",
    icon: "⚠",
  },
  ok: {
    idle: "border-green-300 bg-green-50 text-green-800 hover:bg-green-100",
    active: "border-green-500 bg-green-600 text-white",
    icon: "✓",
  },
  info: {
    idle: "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100",
    active: "border-blue-500 bg-blue-600 text-white",
    icon: "i",
  },
  muted: {
    idle: "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200",
    active: "border-slate-500 bg-slate-600 text-white",
    icon: "i",
  },
};

const PANEL: Record<AlertTone, string> = {
  danger: "border-red-300 bg-red-50 text-red-800",
  warn: "border-amber-300 bg-amber-50 text-amber-800",
  ok: "border-green-300 bg-green-50 text-green-800",
  info: "border-blue-300 bg-blue-50 text-blue-800",
  muted: "border-slate-300 bg-slate-50 text-slate-700",
};

/**
 * Every status that used to be a full-width banner mid-page, compressed into a
 * single row of chips directly under the student bar. Nothing important can now
 * be missed by not scrolling; the full banner text is one click away.
 */
export function buildAlerts(report: AnalysisReport): AlertItem[] {
  const alerts: AlertItem[] = [];

  if (report.onProbation) {
    alerts.push({
      id: "probation",
      tone: "danger",
      label:
        report.probationSemesters > 0
          ? `Probation · semester ${report.probationSemesters} of 3`
          : "Academic probation (half-load)",
      detail:
        `Cumulative G.P.A (${report.gpa}) is below 2.0. The student may register at most ` +
        `12 credit hours per semester, cannot register Project I, and cannot graduate ` +
        `until the G.P.A reaches 2.0.` +
        (report.probationSemestersExceeded
          ? " Probation limit of 3 semesters reached — student is at risk of dismissal."
          : ""),
    });
  }

  if (report.graduationEligible) {
    alerts.push({
      id: "graduation",
      tone: "ok",
      label: "Eligible to graduate",
      detail: `Student has ${report.totalCreditHours} credit hours (≥ 132) and has cleared all remaining requirements.`,
    });
  } else if (report.graduationCreditRequirementMet) {
    alerts.push({
      id: "graduation",
      tone: "info",
      label: "132 Cr. met · requirements outstanding",
      detail: `Student has ${report.totalCreditHours} credit hours, but some graduation requirements are still outstanding (see the requirement cards). Not yet eligible to graduate.`,
    });
  } else {
    alerts.push({
      id: "graduation",
      tone: "muted",
      label: `${report.creditHoursToGraduation} Cr. to graduation`,
      detail: `Student has ${report.totalCreditHours} of the 132 credit hours required to graduate.`,
    });
  }

  if (report.practicalTrainingWarning) {
    alerts.push({
      id: "practical",
      tone: "warn",
      label: "CIT4000 not completed",
      detail: `Student has ${report.totalCreditHours} credit hours and is near graduation but has not completed CIT4000 – Practical Training. Advise registering this course.`,
    });
  }

  if (report.withdrawnFailedCourses.length > 0) {
    alerts.push({
      id: "failed",
      tone: "warn",
      label: `${report.withdrawnFailedCourses.length} withdrawn / failed`,
      detail:
        "Courses withdrawn (W) or failed (F). They earn no credit hours and must be repeated where the plan requires them — see the Withdrawn / Failed card.",
    });
  }

  if (report.retakeRecommendations.length > 0) {
    alerts.push({
      id: "retakes",
      tone: "warn",
      label: `${report.retakeRecommendations.length} retake${
        report.retakeRecommendations.length === 1 ? "" : "s"
      } advised`,
      detail:
        "Courses passed with D+ or lower within the last academic year of the transcript. Repeating them can still raise the G.P.A — see the Recommended Retakes card.",
    });
  }

  if (report.outOfPlanCourses.length > 0) {
    alerts.push({
      id: "outofplan",
      tone: "muted",
      label: `${report.outOfPlanCourses.length} out of plan`,
      detail:
        "Courses on the transcript that are not part of the department's official study plan — confirm they were intended before counting them.",
    });
  }

  return alerts;
}

export function AlertStrip({ report }: { report: AnalysisReport }) {
  const alerts = buildAlerts(report);
  const [openId, setOpenId] = useState<string | null>(null);
  const open = alerts.find((a) => a.id === openId) ?? null;

  return (
    <div className="flex-shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        {alerts.map((alert) => {
          const style = CHIP[alert.tone];
          const isOpen = openId === alert.id;
          return (
            <button
              key={alert.id}
              onClick={() => setOpenId(isOpen ? null : alert.id)}
              aria-expanded={isOpen}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                isOpen ? style.active : style.idle
              }`}
            >
              <span aria-hidden="true">{style.icon}</span>
              {alert.label}
            </button>
          );
        })}
      </div>

      {/* Detail of the selected chip. On screen it replaces nothing and pushes
          nothing off — the board below simply gets slightly shorter. */}
      {open && (
        <div className={`mt-2 rounded-lg border px-3 py-2 text-sm ${PANEL[open.tone]}`}>
          {open.detail}
        </div>
      )}

      {/* Printing has no clicks, so every detail is spelled out on paper. */}
      <div className="hidden print:mt-2 print:block print:space-y-1">
        {alerts.map((alert) => (
          <p key={alert.id} className="text-sm text-slate-800">
            <span className="font-semibold">{alert.label}:</span> {alert.detail}
          </p>
        ))}
      </div>
    </div>
  );
}
