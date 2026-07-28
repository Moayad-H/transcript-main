"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnalysisReport, TranscriptData } from "@/types";
import { formatReportAsText } from "@/lib/analysis/reportGenerator";
import { downloadTextFile } from "@/lib/utils/helpers";
import { CardEmpty, DashCard } from "./report/DashCard";
import { CourseRow } from "./report/CourseRow";
import { StudentBar } from "./report/StudentBar";
import { AlertStrip } from "./report/AlertStrip";
import { RequirementsCard } from "./report/RequirementsCard";
import { RegisterSection } from "./report/RegisterSection";
import { AiNotesCard } from "./report/AiNotesCard";

// Client-only: React Flow measures the DOM, so keep it out of the static export prerender.
const CourseGraphView = dynamic(() => import("./CourseGraphView"), {
  ssr: false,
});

interface ReportDisplayProps {
  report: AnalysisReport;
  transcriptData: TranscriptData;
  onReset: () => void;
}

/** Column of cards; each card shares the column height and scrolls its own body. */
const COLUMN = "flex min-h-0 flex-col gap-3 xl:h-full print:block";
/** A card in a column: fixed share of the viewport on the board, natural height below it. */
const CARD = "min-h-[13rem] xl:min-h-0 xl:flex-1 print:mb-4 print:min-h-0";

/**
 * In a column of two cards, an empty one shrinks to its header so the card that
 * actually has something to say gets the height.
 */
const stacked = (count: number) =>
  count === 0 ? "xl:flex-none xl:min-h-0 min-h-[7rem] print:mb-4" : CARD;

export function ReportDisplay({
  report,
  transcriptData,
  onReset,
}: ReportDisplayProps) {
  const [view, setView] = useState<"report" | "graph">("report");

  // The cockpit is a fixed-height board: on wide screens the document itself
  // must not scroll, or cards would scroll internally *and* the page would move
  // under them. Scoped to this screen and released on unmount.
  useEffect(() => {
    document.body.classList.add("cockpit-lock");
    return () => document.body.classList.remove("cockpit-lock");
  }, []);

  const handleDownload = async () => {
    try {
      const response = await fetch("/api/download-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ report }),
      });

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.studentName}_report.txt`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Download error:", error);
      // Fallback to client-side download
      const textContent = formatReportAsText(report);
      downloadTextFile(textContent, `${report.studentName}_report.txt`);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 print:block">
      <StudentBar
        report={report}
        view={view}
        onViewChange={setView}
        onBack={onReset}
        onPrint={handlePrint}
        onDownload={handleDownload}
      />

      {view === "graph" ? (
        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <CourseGraphView report={report} transcriptData={transcriptData} />
        </div>
      ) : (
        <>
          <AlertStrip report={report} />

          {/* The board. Four columns on a desktop screen, all visible at once;
              two below 1280px and one on mobile, where the page scrolls again
              because there is no honest way to fit this on a phone. */}
          <div className="grid min-h-0 flex-1 grid-cols-1 items-start gap-3 overflow-y-auto pb-1 md:grid-cols-2 xl:grid-cols-4 xl:items-stretch xl:overflow-hidden print:block print:overflow-visible">
            {/* 1 — what the advisor is here to answer: what can they take? */}
            <div className={COLUMN}>
              <DashCard
                title="Courses You Can Register"
                tone="blue"
                badge={
                  report.availableCourses.length +
                  report.availableMajorElectives.length +
                  report.availableScienceElectives.length +
                  report.availableUniversityRequirements.length +
                  report.availableProfessionalTraining.length
                }
                className={`${CARD} xl:min-h-0`}
              >
                {report.availableCourses.length === 0 &&
                report.availableMajorElectives.length === 0 &&
                report.availableScienceElectives.length === 0 &&
                report.availableUniversityRequirements.length === 0 &&
                report.availableProfessionalTraining.length === 0 ? (
                  <CardEmpty>No available courses at this time</CardEmpty>
                ) : (
                  <>
                    {report.availableCourses.length > 0 && (
                      <>
                        {/* A — the actual advising recommendation: a capped, plan-ordered
                            subset the student should register this semester. Open by
                            default since it's the answer the advisor is here for. */}
                        <RegisterSection
                          label="A · Recommended This Semester"
                          count={report.recommendedCourses.length}
                          labelClassName="text-slate-500"
                          defaultExpanded
                        >
                          {report.recommendedCourses.length === 0 ? (
                            <p className="mb-2 text-[11px] italic text-slate-400">
                              None recommended for this semester
                            </p>
                          ) : (
                            <ul className="mb-1">
                              {report.recommendedCourses.map((course, idx) => (
                                <CourseRow
                                  key={idx}
                                  code={course.code}
                                  title={course.title}
                                  tone="blue"
                                />
                              ))}
                            </ul>
                          )}
                        </RegisterSection>

                        {/* B — eligible but not this semester's priority. */}
                        {report.otherEligibleCourses.length > 0 && (
                          <RegisterSection
                            label="B · Other Eligible Courses"
                            count={report.otherEligibleCourses.length}
                            labelClassName="text-slate-400"
                            divider
                          >
                            <ul>
                              {report.otherEligibleCourses.map((course, idx) => (
                                <CourseRow
                                  key={idx}
                                  code={course.code}
                                  title={course.title}
                                  tone="slate"
                                />
                              ))}
                            </ul>
                          </RegisterSection>
                        )}
                      </>
                    )}

                    {/* C — the concrete major electives that fill an open major-
                        elective slot (surfaced for years 3–4, when these come due). */}
                    {report.availableMajorElectives.length > 0 && (
                      <RegisterSection
                        label={`C · Major Electives (${report.department})`}
                        count={report.availableMajorElectives.length}
                        labelClassName="text-indigo-500"
                        note={
                          <>
                            {" "}
                            · {report.remainingMajorElectives} slot
                            {report.remainingMajorElectives === 1 ? "" : "s"} left
                          </>
                        }
                        divider
                      >
                        <ul>
                          {report.availableMajorElectives.map((course, idx) => (
                            <CourseRow
                              key={idx}
                              code={course.code}
                              title={course.title}
                              tone="indigo"
                            />
                          ))}
                        </ul>
                      </RegisterSection>
                    )}

                    {/* D — the next Professional Training slot in the fixed
                        Sem 5–8 sequence (surfaced from year 3, when it comes due). */}
                    {report.availableProfessionalTraining.length > 0 && (
                      <RegisterSection
                        label="D · Professional Training"
                        count={report.availableProfessionalTraining.length}
                        labelClassName="text-teal-600"
                        note={
                          <>
                            {" "}
                            · {report.remainingProfessionalTraining} slot
                            {report.remainingProfessionalTraining === 1 ? "" : "s"}{" "}
                            left
                          </>
                        }
                        divider
                      >
                        <ul>
                          {report.availableProfessionalTraining.map(
                            (course, idx) => (
                              <CourseRow
                                key={idx}
                                code={course.code}
                                title={course.title}
                                tone="teal"
                              />
                            )
                          )}
                        </ul>
                      </RegisterSection>
                    )}

                    {/* E — the concrete science electives that fill an open
                        science-elective slot. */}
                    {report.availableScienceElectives.length > 0 && (
                      <RegisterSection
                        label="E · Science Electives"
                        count={report.availableScienceElectives.length}
                        labelClassName="text-cyan-600"
                        note={
                          <>
                            {" "}
                            · {report.remainingScienceElectives} slot
                            {report.remainingScienceElectives === 1 ? "" : "s"}{" "}
                            left
                          </>
                        }
                        divider
                      >
                        <ul>
                          {report.availableScienceElectives.map((course, idx) => (
                            <CourseRow
                              key={idx}
                              code={course.code}
                              title={course.title}
                              tone="cyan"
                            />
                          ))}
                        </ul>
                      </RegisterSection>
                    )}

                    {/* F — the concrete university requirements that fill an
                        open university-requirement slot. */}
                    {report.availableUniversityRequirements.length > 0 && (
                      <RegisterSection
                        label="F · University Requirements"
                        count={report.availableUniversityRequirements.length}
                        labelClassName="text-violet-600"
                        note={
                          <>
                            {" "}
                            · {report.remainingUniversityRequirements} slot
                            {report.remainingUniversityRequirements === 1
                              ? ""
                              : "s"}{" "}
                            left
                          </>
                        }
                        divider
                      >
                        <ul>
                          {report.availableUniversityRequirements.map(
                            (course, idx) => (
                              <CourseRow
                                key={idx}
                                code={course.code}
                                title={course.title}
                                tone="violet"
                              />
                            )
                          )}
                        </ul>
                      </RegisterSection>
                    )}
                  </>
                )}
              </DashCard>
            </div>

            {/* 2 — the two lists that change the advice: repeats and pending. */}
            <div className={COLUMN}>
              <DashCard
                title="Recommended Retakes"
                tone="orange"
                badge={report.retakeRecommendations.length}
                className={stacked(report.retakeRecommendations.length)}
              >
                {report.retakeRecommendations.length === 0 ? (
                  <CardEmpty>
                    No courses graded D+ or lower within the last year
                  </CardEmpty>
                ) : (
                  <>
                    <p className="mb-1 text-[11px] leading-snug text-slate-500">
                      Passed weakly within the last academic year
                      {report.latestSemester
                        ? ` (as of ${report.latestSemester.label})`
                        : ""}
                      . Repeating these can still raise the G.P.A.
                    </p>
                    <ul>
                      {report.retakeRecommendations.map((course, idx) => (
                        <CourseRow
                          key={idx}
                          code={course.code}
                          title={course.title}
                          meta={course.semester.label}
                          tag={course.grade}
                          tagTone="orange"
                          tone="orange"
                        />
                      ))}
                    </ul>
                  </>
                )}
              </DashCard>

              <DashCard
                title="Ungraded Subjects"
                tone="amber"
                badge={report.ungradedCourses.length}
                className={stacked(report.ungradedCourses.length)}
              >
                {report.ungradedCourses.length === 0 ? (
                  <CardEmpty>No ungraded courses</CardEmpty>
                ) : (
                  <ul>
                    {report.ungradedCourses.map((course, idx) => (
                      <CourseRow
                        key={idx}
                        code={course.code}
                        title={course.title}
                        meta={course.semester?.label}
                        tone="amber"
                      />
                    ))}
                  </ul>
                )}
              </DashCard>
            </div>

            {/* 3 — the problem lists. */}
            <div className={COLUMN}>
              <RequirementsCard report={report} className={CARD} />

              
            </div>

            {/* 4 — progress toward the degree, plus the optional AI summary. */}
            <div className={COLUMN}>
              <DashCard
                title="Withdrawn / Failed"
                tone="red"
                badge={report.withdrawnFailedCourses.length}
                className={stacked(report.withdrawnFailedCourses.length)}
              >
                {report.withdrawnFailedCourses.length === 0 ? (
                  <CardEmpty>No withdrawn or failed courses</CardEmpty>
                ) : (
                  <ul>
                    {report.withdrawnFailedCourses.map((course, idx) => (
                      <CourseRow
                        key={idx}
                        code={course.code}
                        title={course.title}
                        meta={course.semester?.label}
                        tag={course.grade}
                        tagTone={course.grade === "F" ? "red" : "orange"}
                        tone="red"
                      />
                    ))}
                  </ul>
                )}
              </DashCard>
              <DashCard
                title="Courses Not in Official Plan"
                tone="slate"
                badge={report.outOfPlanCourses.length}
                className={stacked(report.outOfPlanCourses.length)}
              >
                {report.outOfPlanCourses.length === 0 ? (
                  <CardEmpty>None</CardEmpty>
                ) : (
                  <ul>
                    {report.outOfPlanCourses.map((course, idx) => (
                      <CourseRow
                        key={idx}
                        code={course.code}
                        title={course.title}
                        meta={course.semester?.label}
                        tone="slate"
                      />
                    ))}
                  </ul>
                )}
              </DashCard>
              <AiNotesCard report={report} className={CARD} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
