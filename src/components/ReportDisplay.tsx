"use client";

import { AnalysisReport } from "@/types";
import { ReportSection } from "./ReportSection";
import { formatReportAsText } from "@/lib/analysis/reportGenerator";
import { downloadTextFile } from "@/lib/utils/helpers";

interface ReportDisplayProps {
  report: AnalysisReport;
  onReset: () => void;
}

export function ReportDisplay({ report, onReset }: ReportDisplayProps) {
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
          <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
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
          </div>
        </div>

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
      </div>
    </div>
  );
}
