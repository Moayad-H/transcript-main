"use client";

import { useState } from "react";
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
  const issuesCount = report.retakeRecommendations.length + report.withdrawnFailedCourses.length;
  const pendingCount = report.ungradedCourses.length + report.outOfPlanCourses.length;

  const [activeTab, setActiveTab] = useState<TabType>(
    issuesCount > 0 ? "issues" : pendingCount > 0 ? "pending" : "ai"
  );

  return (
    <DashCard
      title="Academic Health & Audit"
      tone={issuesCount > 0 ? "orange" : "slate"}
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
            <span>Retakes & Failed</span>
            {issuesCount > 0 && (
              <span className="rounded-full bg-orange-100 px-1.5 py-0.2 text-[10px] font-bold text-orange-800">
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
      {/* TAB 1: Issues (Retakes + Withdrawn / Failed) */}
      <div className={`${activeTab === "issues" ? "" : "hidden"} print:block space-y-3`}>
        {/* Recommended Retakes */}
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-orange-800 flex items-center gap-1">
              <span>↺</span> Recommended Retakes
            </h4>
            <span className="text-[11px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded">
              {report.retakeRecommendations.length}
            </span>
          </div>

          {report.retakeRecommendations.length === 0 ? (
            <CardEmpty>No courses graded D+ or lower within the last year.</CardEmpty>
          ) : (
            <>
              <p className="mb-1 text-[11px] leading-snug text-slate-500">
                Passed weakly within the last academic year
                {report.latestSemester ? ` (as of ${report.latestSemester.label})` : ""}.
                Repeating these can raise cumulative G.P.A.
              </p>
              <ul className="space-y-0.5">
                {report.retakeRecommendations.map((course, idx) => (
                  <CourseRow
                    key={idx}
                    code={course.code}
                    title={course.title}
                    credits={getCourseCredits(course.code)}
                    meta={course.semester.label}
                    tag={course.grade}
                    tagTone="orange"
                    tone="orange"
                  />
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Withdrawn / Failed */}
        <div>
          <div className="flex items-center justify-between border-b border-slate-100 pb-1 mb-1.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-red-800 flex items-center gap-1">
              <span>⚠</span> Withdrawn / Failed Courses
            </h4>
            <span className="text-[11px] font-bold text-red-700 bg-red-50 px-1.5 py-0.5 rounded">
              {report.withdrawnFailedCourses.length}
            </span>
          </div>

          {report.withdrawnFailedCourses.length === 0 ? (
            <CardEmpty>No withdrawn or failed courses on record.</CardEmpty>
          ) : (
            <ul className="space-y-0.5">
              {report.withdrawnFailedCourses.map((course, idx) => (
                <CourseRow
                  key={idx}
                  code={course.code}
                  title={course.title}
                  credits={getCourseCredits(course.code)}
                  meta={course.semester?.label}
                  tag={course.grade}
                  tagTone={course.grade === "F" ? "red" : "orange"}
                  tone="red"
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
