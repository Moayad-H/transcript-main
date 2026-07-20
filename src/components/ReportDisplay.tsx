"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { AnalysisReport, TranscriptData } from "@/types";
import { ReportSection } from "./ReportSection";
import { formatReportAsText } from "@/lib/analysis/reportGenerator";
import { downloadTextFile } from "@/lib/utils/helpers";

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
    <div className="max-w-5xl mx-auto">
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
        <div className="bg-blue-600 text-white p-8 print:bg-blue-600">
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
        <div className="p-6 border-b flex gap-3 print:hidden">
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
        </div>

        {/* Report Sections */}
        <div className="p-8 space-y-8">
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
            badge={`${report.completedUniversityRequirements.length}/${
              report.completedUniversityRequirements.length +
              report.remainingUniversityRequirements
            }`}
            badgeColor="indigo"
          >
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
