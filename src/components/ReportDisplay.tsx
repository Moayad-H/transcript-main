"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { AnalysisReport, TranscriptData } from "@/types";
import { ReportSection } from "./ReportSection";
import { formatReportAsText } from "@/lib/analysis/reportGenerator";
import { downloadTextFile } from "@/lib/utils/helpers";
import { anonymizeReport } from "@/lib/ai/anonymize";
import { generateAdvice } from "@/lib/ai/generateAdvice";
import {
  DAILY_ADVICE_LIMIT,
  getRemainingAdviceCount,
  recordAdviceUse,
} from "@/lib/ai/adviceQuota";

// Client-only: React Flow measures the DOM, so keep it out of the static export prerender.
const CourseGraphView = dynamic(() => import("./CourseGraphView"), {
  ssr: false,
});

interface ReportDisplayProps {
  report: AnalysisReport;
  transcriptData: TranscriptData;
  onReset: () => void;
}

export function ReportDisplay({
  report,
  transcriptData,
  onReset,
}: ReportDisplayProps) {
  const [view, setView] = useState<"report" | "graph">("report");

  // AI advising notes. Kept entirely local to this component and never wired
  // into the upload flow — the report must render in full whether or not this
  // call is ever made or ever succeeds.
  const [advice, setAdvice] = useState<string | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState<string | null>(null);

  // Read after mount, not during render: localStorage does not exist during the
  // static export's prerender, and reading it in render would desync hydration.
  const [adviceRemaining, setAdviceRemaining] = useState<number | null>(null);
  useEffect(() => setAdviceRemaining(getRemainingAdviceCount()), []);

  const adviceExhausted = adviceRemaining !== null && adviceRemaining <= 0;

  const handleGenerateAdvice = async () => {
    if (adviceExhausted) return;

    setAdviceLoading(true);
    setAdviceError(null);
    // Counted before the response, so a failure mid-flight cannot be retried
    // for free. The server caps are the real bound; this only paces the UI.
    recordAdviceUse();
    setAdviceRemaining(getRemainingAdviceCount());

    try {
      // Only the anonymized payload leaves the browser — no name, no student ID.
      const result = await generateAdvice(anonymizeReport(report));
      if (result.status === "ok") {
        setAdvice(result.advice);
      } else if (result.status === "throttled") {
        setAdviceError("Too many requests just now. Wait a minute and try again.");
      } else if (result.status === "daily-limit") {
        setAdviceError(result.message);
        setAdviceRemaining(0);
      } else {
        setAdviceError(result.message);
      }
    } catch (error) {
      console.error("AI notes error:", error);
      setAdviceError("Could not generate notes. Try again.");
    } finally {
      setAdviceLoading(false);
    }
  };

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
    <div
      className={
        view === "graph"
          ? "relative left-1/2 right-1/2 -translate-x-1/2 w-screen px-4 sm:px-6"
          : "max-w-5xl mx-auto"
      }
    >
      <button
        onClick={onReset}
        className="mb-6 flex items-center text-blue-600 hover:text-blue-800 transition-colors font-medium print:hidden"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 mr-1"
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z"
            clipRule="evenodd"
          />
        </svg>
        Back to Upload
      </button>

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 text-white p-8 print:bg-blue-600" id="report-header">
          <h1 className="text-3xl font-bold">Academic Advising Report</h1>
          <p className="text-blue-100 mt-2">
            CCIT - College of Computing and Information Technology
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4 text-sm">
            <div>
              <span className="text-blue-200">Student:</span>
              <p className="font-semibold">{report.studentName}</p>
            </div>
            <div>
              <span className="text-blue-200">Department:</span>
              <p className="font-semibold">{report.department}</p>
            </div>
            <div>
              <span className="text-blue-200">Credit Hours:</span>
              <p className="font-semibold">{report.totalCreditHours}</p>
            </div>
            <div>
              <span className="text-blue-200">Expected Credit Hours:</span>
              <p className="font-semibold">{report.expectedCreditHours}</p>
            </div>
            {report.gpa !== null && (
              <div>
                <span className="text-blue-200">G.P.A:</span>
                <p className="font-semibold">{report.gpa}</p>
              </div>
            )}
            {report.latestSemester && (
              <div>
                <span className="text-blue-200">Latest Semester:</span>
                <p className="font-semibold">{report.latestSemester.label}</p>
              </div>
            )}
            <div>
              <span className="text-blue-200">To Graduate:</span>
              <p className="font-semibold">
                {report.graduationCreditRequirementMet
                  ? "132 Cr. met"
                  : `${report.creditHoursToGraduation} Cr. left`}
              </p>
            </div>
          </div>
        </div>

        {/* View toggle */}
        <div className="px-6 pt-4 flex gap-2 border-b print:hidden">
          <button
            onClick={() => setView("report")}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              view === "report"
                ? "bg-white text-blue-600 border border-b-white border-gray-200 -mb-px"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Report
          </button>
          <button
            onClick={() => setView("graph")}
            className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
              view === "graph"
                ? "bg-white text-blue-600 border border-b-white border-gray-200 -mb-px"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            Course Graph
          </button>
        </div>

        {view === "graph" && (
          <CourseGraphView report={report} transcriptData={transcriptData} />
        )}

        {view === "report" && (
          <>
        {/* Academic probation (half-load) */}
        {report.onProbation && (
          <div className="mx-8 mt-6 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 flex-shrink-0 text-red-600"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.28 11.18c.75 1.334-.213 2.987-1.742 2.987H3.72c-1.53 0-2.493-1.653-1.743-2.987l6.28-11.18zM11 14a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-red-800">
                  Academic probation (half-load)
                </p>
                {report.probationSemesters > 0 && (
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      report.probationSemestersExceeded
                        ? "bg-red-700 text-white"
                        : "bg-red-200 text-red-800"
                    }`}
                  >
                    Semester {report.probationSemesters} of 3
                  </span>
                )}
              </div>
              <p className="text-sm text-red-700 mt-1">
                Cumulative G.P.A ({report.gpa}) is below 2.0. The student may
                register at most 12 credit hours per semester, cannot register
                Project I, and cannot graduate until the G.P.A reaches 2.0.
              </p>
              {report.probationSemestersExceeded && (
                <p className="text-sm font-semibold text-red-800 mt-1">
                  Probation limit of 3 semesters reached — student is at risk of
                  dismissal.
                </p>
              )}
            </div>
          </div>
        )}
        {/* Graduation status */}
        {report.graduationEligible ? (
          <div className="mx-8 mt-6 flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 p-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 flex-shrink-0 text-green-600"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="font-semibold text-green-800">
                Graduation requirements met
              </p>
              <p className="text-sm text-green-700">
                Student has {report.totalCreditHours} credit hours (≥ 132) and
                has cleared all remaining requirements. Eligible to graduate.
              </p>
            </div>
          </div>
        ) : report.graduationCreditRequirementMet ? (
          <div className="mx-8 mt-6 flex items-start gap-3 rounded-lg border border-blue-300 bg-blue-50 p-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 flex-shrink-0 text-blue-600"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="font-semibold text-blue-800">
                132 Cr. credit requirement met
              </p>
              <p className="text-sm text-blue-700">
                Student has {report.totalCreditHours} credit hours, but some
                graduation requirements are still outstanding (see sections
                below). Not yet eligible to graduate.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-8 mt-6 flex items-start gap-3 rounded-lg border border-gray-300 bg-gray-50 p-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 flex-shrink-0 text-gray-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="font-semibold text-gray-800">
                {report.creditHoursToGraduation} credit hours to graduation
              </p>
              <p className="text-sm text-gray-600">
                Student has {report.totalCreditHours} of the 132 credit hours
                required to graduate.
              </p>
            </div>
          </div>
        )}
        {report.practicalTrainingWarning && (
          <div className="mx-8 mt-6 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 flex-shrink-0 text-amber-500"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l6.28 11.18c.75 1.334-.213 2.987-1.742 2.987H3.72c-1.53 0-2.493-1.653-1.743-2.987l6.28-11.18zM11 14a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="font-semibold text-amber-800">
                Practical Training (CIT4000) not yet completed
              </p>
              <p className="text-sm text-amber-700">
                Student has {report.totalCreditHours} credit hours and is near
                graduation but has not completed CIT4000 – Practical
                Training. Advise registering this course.
              </p>
            </div>
          </div>
        )}
        {/* Actions */}
        {/* <div className="p-6 border-b flex gap-3 print:hidden">
          <button
            onClick={handleDownload}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            Download Report
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Print Report
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors ml-auto"
          >
            New Analysis
          </button>
        </div> */}

        {/* Report Sections */}
        <div className="p-8 space-y-8">
          {/* AI Advisor Notes — a summary of the sections below, generated on
              demand. Advisory only: the sections themselves remain the record. */}
          <ReportSection title="AI Advisor Notes" badgeColor="indigo">
            {/* Stays visible in the printed report too — anyone reading these
                notes on paper needs the same caveat the advisor got. */}
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
              <span aria-hidden="true" className="text-amber-600">
                ⚠
              </span>
              <p className="text-sm text-amber-800">
                <span className="font-semibold">Feature under testing.</span>{" "}
                These notes are experimental and may be incomplete or wrong.
                They are a summary of the sections below, not a substitute for
                them — always confirm against the report before advising a
                student. Usage is limited while the feature is being evaluated.
              </p>
            </div>

            {advice ? (
              <div>
                <p className="whitespace-pre-line text-gray-700">{advice}</p>
                <p className="mt-3 text-xs text-gray-500 italic">
                  AI-generated — verify against the sections below before advising.
                </p>
              </div>
            ) : (
              <div className="print:hidden">
                <p className="text-gray-500 italic mb-3">
                  Generate a short summary of what this student should register
                  and prioritise next semester.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleGenerateAdvice}
                    disabled={adviceLoading || adviceExhausted}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
                  >
                    {adviceLoading ? "Generating notes…" : "Generate AI Notes"}
                  </button>
                  {adviceRemaining !== null && (
                    <span
                      className={`text-sm ${
                        adviceExhausted ? "text-red-600 font-medium" : "text-gray-500"
                      }`}
                    >
                      {adviceExhausted
                        ? "Daily limit reached — resets tomorrow."
                        : `${adviceRemaining} of ${DAILY_ADVICE_LIMIT} left today`}
                    </span>
                  )}
                </div>
              </div>
            )}
            {adviceError && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3 print:hidden">
                <p className="text-sm text-red-700">{adviceError}</p>
              </div>
            )}
          </ReportSection>

          {/* Ungraded Courses */}
          <ReportSection
            title="Ungraded Subjects"
            badge={report.ungradedCourses.length}
            badgeColor="yellow"
          >
            {report.ungradedCourses.length === 0 ? (
              <p className="text-gray-500 italic">No ungraded courses</p>
            ) : (
              <ul className="space-y-2">
                {report.ungradedCourses.map((course, idx) => (
                  <li key={idx} className="text-gray-700">
                    <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                      {course.code}
                    </span>
                    <span className="ml-2">{course.title}</span>
                    {course.semester && (
                      <span className="ml-2 text-xs text-gray-500">
                        {course.semester.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </ReportSection>

          {/* Withdrawn/Failed Courses */}
          <ReportSection
            title="Withdrawn / Failed Courses"
            badge={report.withdrawnFailedCourses.length}
            badgeColor="red"
          >
            {report.withdrawnFailedCourses.length === 0 ? (
              <p className="text-gray-500 italic">No withdrawn or failed courses</p>
            ) : (
              <ul className="space-y-2">
                {report.withdrawnFailedCourses.map((course, idx) => (
                  <li key={idx} className="text-gray-700 flex justify-between items-center">
                    <div>
                      <span className="font-mono text-sm bg-red-50 px-2 py-1 rounded">
                        {course.code}
                      </span>
                      <span className="ml-2">{course.title}</span>
                      {course.semester && (
                        <span className="ml-2 text-xs text-gray-500">
                          {course.semester.label}
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-sm font-bold px-2 py-1 rounded ${
                        course.grade === "F"
                          ? "bg-red-100 text-red-800"
                          : "bg-orange-100 text-orange-800"
                      }`}
                    >
                      {course.grade}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </ReportSection>

        

          {/* Available Courses */}
          <ReportSection
            title="Courses You Can Register"
            badge={report.availableCourses.length}
            badgeColor="blue"
          >
            {report.availableCourses.length === 0 ? (
              <p className="text-gray-500 italic">
                No available courses at this time
              </p>
            ) : (
              <ul className="space-y-2">
                {report.availableCourses.map((course, idx) => (
                  <li key={idx} className="text-gray-700">
                    <span className="font-mono text-sm bg-blue-50 px-2 py-1 rounded">
                      {course.code}
                    </span>
                    <span className="ml-2">{course.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </ReportSection>
  {/* Recommended Retakes */}
          <ReportSection
            title="Recommended Retakes"
            badge={report.retakeRecommendations.length}
            badgeColor="orange"
          >
            {report.retakeRecommendations.length === 0 ? (
              <p className="text-gray-500 italic">
                No courses graded D+ or lower within the last year
              </p>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-3">
                  Passed with a weak grade within the last academic year of the
                  transcript
                  {report.latestSemester
                    ? ` (as of ${report.latestSemester.label})`
                    : ""}
                  . Repeating these can still raise the G.P.A.
                </p>
                <ul className="space-y-2">
                  {report.retakeRecommendations.map((course, idx) => (
                    <li
                      key={idx}
                      className="text-gray-700 flex justify-between items-center gap-3"
                    >
                      <div>
                        <span className="font-mono text-sm bg-orange-50 px-2 py-1 rounded">
                          {course.code}
                        </span>
                        <span className="ml-2">{course.title}</span>
                        <span className="ml-2 text-xs text-gray-500">
                          {course.semester.label}
                        </span>
                      </div>
                      <span className="text-sm font-bold px-2 py-1 rounded bg-orange-100 text-orange-800 whitespace-nowrap">
                        {course.grade}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </ReportSection>
          {/* Major Electives */}
          <ReportSection
            title="Major Electives"
            badge={`${report.completedMajorElectives.length}/${
              report.completedMajorElectives.length +
              report.remainingMajorElectives
            }`}
            badgeColor="purple"
          >
            {report.completedMajorElectives.length === 0 ? (
              <p className="text-gray-500 italic">
                No major electives completed yet
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-600 mb-2">
                  Completed:
                </p>
                <ul className="space-y-2 mb-4">
                  {report.completedMajorElectives.map((course, idx) => (
                    <li key={idx} className="text-gray-700">
                      <span className="font-mono text-sm bg-purple-50 px-2 py-1 rounded">
                        {course.code}
                      </span>
                      <span className="ml-2">{course.title}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="text-sm font-medium text-gray-800 mt-4">
              Remaining: {report.remainingMajorElectives} course(s)
            </p>
          </ReportSection>

          {/* Science Electives */}
          <ReportSection
            title="Science Electives"
            badge={`${report.completedScienceElectives.length}/${
              report.completedScienceElectives.length +
              report.remainingScienceElectives
            }`}
            badgeColor="green"
          >
            {report.completedScienceElectives.length === 0 ? (
              <p className="text-gray-500 italic">
                No science electives completed yet
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-600 mb-2">
                  Completed:
                </p>
                <ul className="space-y-2 mb-4">
                  {report.completedScienceElectives.map((course, idx) => (
                    <li key={idx} className="text-gray-700">
                      <span className="font-mono text-sm bg-green-50 px-2 py-1 rounded">
                        {course.code}
                      </span>
                      <span className="ml-2">{course.title}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="text-sm font-medium text-gray-800 mt-4">
              Remaining: {report.remainingScienceElectives} course(s)
            </p>
          </ReportSection>

          {/* University Requirements */}
          <ReportSection
            title="University Requirements"
            badge={`${report.completedUniversityRequirements.length}/${report.requiredUniversityRequirements}`}
            badgeColor={
              report.excessUniversityRequirements.length > 0 ? "red" : "indigo"
            }
          >
            {report.excessUniversityRequirements.length > 0 && (
              <div className="mb-4 rounded-lg border-l-4 border-red-500 bg-red-50 p-4">
                <p className="font-semibold text-red-800">
                  Extra University Requirement course
                  {report.excessUniversityRequirements.length > 1 ? "s" : ""} taken
                </p>
                <p className="mt-1 text-sm text-red-700">
                  The study plan allows only{" "}
                  {report.requiredUniversityRequirements} University Requirement
                  course
                  {report.requiredUniversityRequirements === 1 ? "" : "s"}, but{" "}
                  {report.completedUniversityRequirements.length} were passed.
                  The extra course
                  {report.excessUniversityRequirements.length > 1 ? "s" : ""} do
                  not count toward the degree plan, so{" "}
                  {report.excessUniversityCreditHours} credit hour
                  {report.excessUniversityCreditHours === 1 ? "" : "s"} were
                  spent without progressing toward graduation.
                </p>
                <ul className="mt-2 space-y-1">
                  {report.excessUniversityRequirements.map((course, idx) => (
                    <li key={idx} className="text-sm text-red-800">
                      <span className="font-mono bg-red-100 px-2 py-0.5 rounded">
                        {course.code}
                      </span>
                      <span className="ml-2">{course.title}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.completedUniversityRequirements.length === 0 ? (
              <p className="text-gray-500 italic">
                No university requirements completed yet
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-600 mb-2">
                  Completed:
                </p>
                <ul className="space-y-2 mb-4">
                  {report.completedUniversityRequirements.map((course, idx) => (
                    <li key={idx} className="text-gray-700">
                      <span className="font-mono text-sm bg-indigo-50 px-2 py-1 rounded">
                        {course.code}
                      </span>
                      <span className="ml-2">{course.title}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="text-sm font-medium text-gray-800 mt-4">
              Remaining: {report.remainingUniversityRequirements} course(s)
            </p>
          </ReportSection>

          {/* Professional Training */}
          <ReportSection
            title="Professional Training"
            badge={`${report.completedProfessionalTraining.length}/${
              report.completedProfessionalTraining.length +
              report.remainingProfessionalTraining
            }`}
            badgeColor="orange"
          >
            {report.completedProfessionalTraining.length === 0 ? (
              <p className="text-gray-500 italic">
                No professional training completed yet
              </p>
            ) : (
              <>
                <p className="text-sm font-medium text-gray-600 mb-2">
                  Completed:
                </p>
                <ul className="space-y-2 mb-4">
                  {report.completedProfessionalTraining.map((course, idx) => (
                    <li key={idx} className="text-gray-700">
                      {course}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="text-sm font-medium text-gray-800 mt-4">
              Remaining: {report.remainingProfessionalTraining} course(s)
            </p>
          </ReportSection>

          {/* Practical Training (CIT4000) */}
          <ReportSection
            title="Practical Training (CIT4000)"
            badge={
              report.practicalTrainingCompleted
                ? "Completed"
                : report.practicalTrainingUngraded
                ? "In Progress"
                : report.practicalTrainingEligible
                ? "Available"
                : "Not Yet Eligible"
            }
            badgeColor={
              report.practicalTrainingCompleted
                ? "green"
                : report.practicalTrainingUngraded
                ? "yellow"
                : "teal"
            }
          >
            {report.practicalTrainingCompleted ? (
              <p className="text-gray-700">
                CIT4000 – Practical Training has been completed.
              </p>
            ) : report.practicalTrainingUngraded ? (
              <p className="text-gray-700">
                CIT4000 – Practical Training is registered; grade pending.
              </p>
            ) : report.practicalTrainingEligible ? (
              <p className="text-gray-700">
                Student has reached 90+ credit hours and can register
                CIT4000 – Practical Training.
              </p>
            ) : (
              <p className="text-gray-500 italic">
                Requires 90 credit hours to register (student has{" "}
                {report.totalCreditHours}).
              </p>
            )}
          </ReportSection>

          {/* Out of Plan Courses */}
          <ReportSection
            title="Courses Not in Official Plan"
            badge={report.outOfPlanCourses.length}
            badgeColor="red"
          >
            {report.outOfPlanCourses.length === 0 ? (
              <p className="text-gray-500 italic">None</p>
            ) : (
              <ul className="space-y-2">
                {report.outOfPlanCourses.map((course, idx) => (
                  <li key={idx} className="text-gray-700">
                    <span className="font-mono text-sm bg-red-50 px-2 py-1 rounded">
                      {course.code}
                    </span>
                    <span className="ml-2">{course.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </ReportSection>
        </div>
          </>
        )}
      </div>
    </div>
  );
}
