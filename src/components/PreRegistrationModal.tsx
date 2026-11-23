"use client";

import React, { useEffect, useMemo, useState } from "react";
import { loadSession } from "@/lib/auth/session";
import { logAdvisorAction } from "@/lib/logging/auditLogger";
import {
  PreRegistrationFormData,
  PreRegistrationStudentInput,
  buildBatchPreRegistrationData,
  downloadBatchCombinedPreRegistrationForm,
  downloadBatchIndividualPreRegistrationForms,
  downloadSinglePreRegistrationForm,
} from "@/lib/utils/preRegistrationForm";

export type BatchExportMode = "combined" | "individual";

interface PreRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: PreRegistrationStudentInput[];
  source?: "single" | "batch";
}

function StudentFieldsPreviewTable({ data }: { data: PreRegistrationFormData }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white text-xs">
      <table className="w-full border-collapse">
        <tbody className="divide-y divide-slate-200">
          <tr>
            <td className="w-2/5 bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 align-top">
              ID
            </td>
            <td className="px-3.5 py-2 font-mono font-semibold text-slate-900">
              {data.studentId || "—"}
            </td>
          </tr>
          <tr>
            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 align-top">
              Student Name
            </td>
            <td className="px-3.5 py-2 font-semibold text-slate-900">
              {data.studentName || "—"}
            </td>
          </tr>
          <tr>
            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 align-top">
              Achieved Credit Hours
              <span className="block text-[10px] font-normal text-slate-500">
                (after the current semester)
              </span>
            </td>
            <td className="px-3.5 py-2 font-bold text-blue-700">
              {data.achievedCreditHoursAfterCurrent} Cr.
            </td>
          </tr>
          <tr>
            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 align-top">
              Department
            </td>
            <td className="px-3.5 py-2 text-slate-900">{data.departmentDisplay}</td>
          </tr>
          <tr>
            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 align-top">
              Remaining Courses
              <span className="ml-1.5 inline-flex items-center rounded-full bg-slate-200 px-1.5 py-0.2 text-[10px] font-bold text-slate-700">
                {data.remainingCourses.length}
              </span>
            </td>
            <td className="px-3.5 py-2 text-slate-800">
              {data.remainingCourses.length === 0 ? (
                <span className="text-emerald-700 font-semibold">None</span>
              ) : (
                <ul className="max-h-40 overflow-y-auto space-y-0.5 pr-1">
                  {data.remainingCourses.map((course, idx) => (
                    <li key={idx} className="leading-snug">
                      {course}
                    </li>
                  ))}
                </ul>
              )}
            </td>
          </tr>
          <tr>
            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 align-top">
              Remaining Professional Training
            </td>
            <td className="px-3.5 py-2 text-slate-800">
              {data.remainingProfessionalTrainingLines.length === 0 ? (
                <span className="text-emerald-700 font-semibold">None</span>
              ) : (
                <div className="space-y-0.5">
                  {data.remainingProfessionalTrainingLines.map((line, idx) => (
                    <div key={idx}>{line}</div>
                  ))}
                </div>
              )}
            </td>
          </tr>
          <tr>
            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 align-top">
              Number of Remaining Majors
            </td>
            <td className="px-3.5 py-2 font-bold text-slate-900">
              {data.numberOfRemainingMajors}
            </td>
          </tr>
          <tr>
            <td className="bg-slate-50 px-3.5 py-2 font-semibold text-slate-700 align-top">
              Taken Major Electives
            </td>
            <td className="px-3.5 py-2 text-slate-800">
              {data.takenMajorElectives.length === 0 ? (
                <span className="text-slate-500">None</span>
              ) : (
                <ul className="space-y-0.5">
                  {data.takenMajorElectives.map((course, idx) => (
                    <li key={idx} className="leading-snug">
                      {course}
                    </li>
                  ))}
                </ul>
              )}
            </td>
          </tr>
        </tbody>
      </table>
      <div className="border-t border-slate-200 bg-slate-50/70 px-3.5 py-1.5 text-[11px] text-slate-500">
        Note: Minor subject fields (<em>Number of Remaining Minors</em> &amp;{" "}
        <em>Taken Minor Electives</em>) are intentionally left blank.
      </div>
    </div>
  );
}

export function PreRegistrationModal({
  isOpen,
  onClose,
  students,
  source = "single",
}: PreRegistrationModalProps) {
  const [advisorName, setAdvisorName] = useState("");
  const [formDataList, setFormDataList] = useState<PreRegistrationFormData[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [exportMode, setExportMode] = useState<BatchExportMode>("combined");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loadingData, setLoadingData] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingSingleKey, setDownloadingSingleKey] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isBatch = students.length > 1;

  // Populate advisor name and compute form fields whenever the modal opens
  useEffect(() => {
    if (!isOpen) return;

    const session = loadSession();
    setAdvisorName(session?.name ?? "");
    setExportMode("combined");
    setSearchQuery("");
    setExpandedKey(null);
    setError(null);
    setSuccessMessage(null);

    let cancelled = false;
    setLoadingData(true);

    buildBatchPreRegistrationData(students)
      .then((computed) => {
        if (cancelled) return;
        setFormDataList(computed);
        setSelectedKeys(new Set(computed.map((_, idx) => String(idx))));
      })
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof Error
            ? err.message
            : "Failed to prepare pre-registration form data."
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingData(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, students]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  const indexedRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return formDataList
      .map((data, idx) => ({ key: String(idx), data }))
      .filter(({ data }) => {
        if (!q) return true;
        return (
          data.studentName.toLowerCase().includes(q) ||
          data.studentId.toLowerCase().includes(q) ||
          data.departmentCode.toLowerCase().includes(q)
        );
      });
  }, [formDataList, searchQuery]);

  const selectedStudents = useMemo(
    () => formDataList.filter((_, idx) => selectedKeys.has(String(idx))),
    [formDataList, selectedKeys]
  );

  const toggleStudent = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedKeys.size === formDataList.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(formDataList.map((_, idx) => String(idx))));
    }
  };

  const handlePrimaryDownload = async () => {
    if (selectedStudents.length === 0) return;

    setDownloading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      if (!isBatch || selectedStudents.length === 1) {
        const target = selectedStudents[0];
        const fileName = await downloadSinglePreRegistrationForm(
          target,
          advisorName
        );
        logAdvisorAction({
          action: "PRE_REG_FORM_DOWNLOADED",
          studentId: target.studentId,
          studentName: target.studentName,
          department: target.departmentCode,
          metadata: { source, mode: "single", fileName },
        });
        setSuccessMessage(`Downloaded ${fileName}`);
      } else if (exportMode === "combined") {
        const fileName = await downloadBatchCombinedPreRegistrationForm(
          selectedStudents,
          advisorName
        );
        logAdvisorAction({
          action: "PRE_REG_FORM_DOWNLOADED",
          metadata: {
            source: "batch",
            mode: "combined",
            count: selectedStudents.length,
            studentIds: selectedStudents.map((s) => s.studentId),
            fileName,
          },
        });
        setSuccessMessage(
          `Downloaded ${fileName} (${selectedStudents.length} students in one document)`
        );
      } else {
        const fileName = await downloadBatchIndividualPreRegistrationForms(
          selectedStudents,
          advisorName
        );
        logAdvisorAction({
          action: "PRE_REG_FORM_DOWNLOADED",
          metadata: {
            source: "batch",
            mode: "individual_zip",
            count: selectedStudents.length,
            studentIds: selectedStudents.map((s) => s.studentId),
            fileName,
          },
        });
        setSuccessMessage(
          `Downloaded ${fileName} (${selectedStudents.length} individual .docx files)`
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate pre-registration form."
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadOneFromBatch = async (
    key: string,
    student: PreRegistrationFormData
  ) => {
    setDownloadingSingleKey(key);
    setError(null);
    setSuccessMessage(null);
    try {
      const fileName = await downloadSinglePreRegistrationForm(
        student,
        advisorName
      );
      logAdvisorAction({
        action: "PRE_REG_FORM_DOWNLOADED",
        studentId: student.studentId,
        studentName: student.studentName,
        department: student.departmentCode,
        metadata: { source: "batch", mode: "single_from_batch", fileName },
      });
      setSuccessMessage(`Downloaded ${fileName}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to generate pre-registration form."
      );
    } finally {
      setDownloadingSingleKey(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 print:hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prereg-modal-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-brand px-5 py-4 text-white">
          <div className="flex items-center gap-3 min-w-0">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 text-lg">
              📝
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="prereg-modal-title" className="text-base font-bold">
                  Fill Pre-registration Form
                </h2>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide">
                  {isBatch ? `${students.length} Batch Students` : "Single Student"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-blue-200">
                Auto-fills the official CCIT Pre-registration Word form (.docx)
                using the student&apos;s transcript &amp; degree plan data.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-blue-200 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-slate-50/60 p-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">
              <strong>Error:</strong> {error}
            </div>
          )}

          {successMessage && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-medium text-emerald-800 flex items-center gap-2">
              <span>✅</span>
              <span>{successMessage}</span>
            </div>
          )}

          {/* Academic Advisor Name Input */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
            <label
              htmlFor="prereg-advisor-name"
              className="block text-xs font-bold text-slate-700 mb-1.5"
            >
              Academic Advisor Name
            </label>
            <input
              id="prereg-advisor-name"
              type="text"
              value={advisorName}
              onChange={(e) => setAdvisorName(e.target.value)}
              placeholder="Enter advisor name (printed on the form header)"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {loadingData ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 text-xs gap-2">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
              <span>Preparing student form data...</span>
            </div>
          ) : !isBatch && formDataList[0] ? (
            /* Single Student Preview */
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-0.5">
                Form Fields Preview
              </h3>
              <StudentFieldsPreviewTable data={formDataList[0]} />
            </div>
          ) : (
            /* Batch Mode: Output Format Choice + Student Checklist */
            <div className="space-y-4">
              {/* Output Mode Selector */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-0.5">
                  Download Format
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExportMode("combined")}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                      exportMode === "combined"
                        ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        exportMode === "combined"
                          ? "border-blue-600 bg-blue-600"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {exportMode === "combined" && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        All Students in One File (.docx)
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-600 leading-snug">
                        One Word document with a separate Table 1 page for each
                        selected student.
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExportMode("individual")}
                    className={`flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all cursor-pointer ${
                      exportMode === "individual"
                        ? "border-blue-600 bg-blue-50/70 ring-2 ring-blue-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                        exportMode === "individual"
                          ? "border-blue-600 bg-blue-600"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {exportMode === "individual" && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        Individual File per Student (.zip)
                      </div>
                      <p className="mt-0.5 text-[11px] text-slate-600 leading-snug">
                        Generates a separate filled .docx file for each student
                        inside one ZIP archive.
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Student Selection List */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 px-0.5">
                      Students Included ({selectedKeys.size} of{" "}
                      {formDataList.length})
                    </h3>
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="text-xs font-semibold text-blue-700 hover:text-blue-900 underline cursor-pointer"
                    >
                      {selectedKeys.size === formDataList.length
                        ? "Deselect All"
                        : "Select All"}
                    </button>
                  </div>

                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter students..."
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {indexedRows.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-500">
                      No students match &ldquo;{searchQuery}&rdquo;.
                    </div>
                  ) : (
                    indexedRows.map(({ key, data }) => {
                      const isChecked = selectedKeys.has(key);
                      const isExpanded = expandedKey === key;
                      const isDownloadingThis = downloadingSingleKey === key;

                      return (
                        <div key={key} className="p-3">
                          <div className="flex items-center justify-between gap-3">
                            <label className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleStudent(key)}
                                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="truncate text-xs font-bold text-slate-900">
                                    {data.studentName}
                                  </span>
                                  <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                                    {data.studentId}
                                  </span>
                                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-800">
                                    {data.departmentCode}
                                  </span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                                  <span>
                                    Expected:{" "}
                                    <strong className="text-slate-700">
                                      {data.achievedCreditHoursAfterCurrent} Cr
                                    </strong>
                                  </span>
                                  <span>
                                    Remaining Courses:{" "}
                                    <strong className="text-slate-700">
                                      {data.remainingCourses.length}
                                    </strong>
                                  </span>
                                  <span>
                                    Remaining Majors:{" "}
                                    <strong className="text-slate-700">
                                      {data.numberOfRemainingMajors}
                                    </strong>
                                  </span>
                                </div>
                              </div>
                            </label>

                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedKey(isExpanded ? null : key)
                                }
                                className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                              >
                                {isExpanded ? "Hide" : "Preview"}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleDownloadOneFromBatch(key, data)
                                }
                                disabled={isDownloadingThis || downloading}
                                title={`Download individual .docx for ${data.studentName}`}
                                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50 cursor-pointer"
                              >
                                {isDownloadingThis ? "..." : "↓ .docx"}
                              </button>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-3 pl-6">
                              <StudentFieldsPreviewTable data={data} />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                <p className="text-[11px] text-slate-500 px-0.5">
                  Minor subject fields (<em>Number of Remaining Minors</em> &amp;{" "}
                  <em>Taken Minor Electives</em>) are automatically left blank on
                  all generated forms.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Close
          </button>

          <button
            type="button"
            onClick={handlePrimaryDownload}
            disabled={loadingData || downloading || selectedStudents.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {downloading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Generating...</span>
              </>
            ) : !isBatch || selectedStudents.length === 1 ? (
              <>
                <span>⬇️</span>
                <span>Download Pre-registration Form (.docx)</span>
              </>
            ) : exportMode === "combined" ? (
              <>
                <span>⬇️</span>
                <span>
                  Download All in One File (.docx) ({selectedStudents.length}{" "}
                  students)
                </span>
              </>
            ) : (
              <>
                <span>📦</span>
                <span>
                  Download Individual Files (.zip) ({selectedStudents.length}{" "}
                  students)
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
