"use client";

import { useState, useMemo } from "react";
import { AnalysisReport } from "@/types";
import { DashCard, CardEmpty } from "./DashCard";
import { CourseRow } from "./CourseRow";
import { AiNotesCard } from "./AiNotesCard";
import { getCourseCredits } from "@/lib/constants";

interface AcademicAuditCardProps {
  report: AnalysisReport;
  className?: string;
}

type TabType = "issues" | "pending" | "ai";

export function AcademicAuditCard({ report, className = "" }: AcademicAuditCardProps) {
  const sortedFailedCourses = useMemo(() => {
    return [...report.withdrawnFailedCourses].sort((a, b) => {
      const aFailed = a.grade === "F" ? 0 : 1;
      const bFailed = b.grade === "F" ? 0 : 1;
      return aFailed - bFailed;
    });
  }, [report.withdrawnFailedCourses]);

  const issuesCount = sortedFailedCourses.length;
  const pendingCount = report.ungradedCourses.length + report.outOfPlanCourses.length;
  const hasFailed = sortedFailedCourses.some((c) => c.grade === "F");

  const [activeTab, setActiveTab] = useState<TabType>(
    issuesCount > 0 ? "issues" : pendingCount > 0 ? "pending" : "ai"
  );

  return (
    <DashCard
      title="Academic Health & Audit"
      tone={hasFailed ? "red" : issuesCount > 0 ? "orange" : "slate"}
      badge={issuesCount > 0 ? `${issuesCount} items` : "All clear"}
      className={className}
      actions={
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab("issues")}
            className={`rounded px-2 py-0.5 transition-colors flex items-center gap-1 ${
              activeTab === "issues"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>Failed &amp; Withdrawn</span>
            {issuesCount > 0 && (
              <span
                className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
                  hasFailed ? "bg-red-100 text-red-800" : "bg-orange-100 text-orange-800"
                }`}
              >
                {issuesCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pending")}
            className={`rounded px-2 py-0.5 transition-colors flex items-center gap-1 ${
              activeTab === "pending"
                ? "bg-white text-slate-800 shadow-sm"
                : "text-slate-500 hover:text-slate-800"
            }`}
          >
            <span>In Progress & Other</span>
            {report.ungradedCourses.length > 0 ? (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                {report.ungradedCourses.length} in progress
              </span>
            ) : pendingCount > 0 ? (
              <span className="rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
                {pendingCount}
              </span>
            ) : null}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ai")}
            className={`rounded px-2 py-0.5 transition-colors flex items-center gap-1 ${
              activeTab === "ai"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-indigo-600"
            }`}
          >
            <span>AI Notes</span>
          </button>
        </div>
      }
    >
      {/* TAB 1: Failed & Withdrawn Courses (Failed courses shown first) */}
      <div className={`${activeTab === "issues" ? "" : "hidden"} print:block space-y-3`}>
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-red-800 flex items-center gap-1">
              <span>⚠</span> Failed &amp; Withdrawn Courses
            </h4>
            <span className="text-[11px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
              {sortedFailedCourses.length}
            </span>
          </div>

          {sortedFailedCourses.length === 0 ? (
            <CardEmpty>No failed or withdrawn courses on record.</CardEmpty>
          ) : (
            <ul className="space-y-0.5">
              {sortedFailedCourses.map((course, idx) => (
                <CourseRow
                  key={idx}
                  code={course.code}
                  title={course.title}
                  credits={getCourseCredits(course.code)}
                  meta={course.semester?.label}
                  tag={course.grade}
                  tagTone={course.grade === "F" ? "red" : "orange"}
                  tone={course.grade === "F" ? "red" : "orange"}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* TAB 2: Pending (Ungraded + Out-of-Plan) */}
      <div className={`${activeTab === "pending" ? "" : "hidden"} print:block space-y-3`}>
        {/* Ungraded Subjects */}
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
              <span>⏳</span> Ungraded Subjects (Grade Pending)
            </h4>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
              {report.ungradedCourses.length}
            </span>
          </div>

          {report.ungradedCourses.length === 0 ? (
            <CardEmpty>No ungraded courses at this time.</CardEmpty>
          ) : (
            <ul className="space-y-0.5">
              {report.ungradedCourses.map((course, idx) => (
                <CourseRow
                  key={idx}
                  code={course.code}
                  title={course.title}
                  credits={getCourseCredits(course.code)}
                  meta={course.semester?.label}
                  tone="amber"
                  badge="Grade Pending (U)"
                  badgeTone="amber"
                />
              ))}
            </ul>
          )}
        </div>

        {/* Out-of-Plan Courses */}
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1">
              <span>📋</span> Courses Not in Official Plan
            </h4>
            <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
              {report.outOfPlanCourses.length}
            </span>
          </div>

          {report.outOfPlanCourses.length === 0 ? (
            <CardEmpty>None — all courses match the department plan.</CardEmpty>
          ) : (
            <>
              <p className="mb-1 text-[11px] text-slate-500 leading-snug">
                Courses taken that are not in the official department study plan:
              </p>
              <ul className="space-y-0.5">
                {report.outOfPlanCourses.map((course, idx) => (
                  <CourseRow
                    key={idx}
                    code={course.code}
                    title={course.title}
                    credits={getCourseCredits(course.code)}
                    meta={course.semester?.label}
                    tone="slate"
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {/* TAB 3: AI Advisor Notes */}
      <div className={`${activeTab === "ai" ? "" : "hidden"} print:block`}>
        <AiNotesCard report={report} />
      </div>
    </DashCard>
  );
}
