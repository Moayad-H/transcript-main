"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AnalysisReport, Course, Department } from "@/types";

import {
  GroupSchedule,
} from "@/types/schedule";
import { getAllSchedules } from "@/lib/analysis/scheduleLoader";
import {
  findSchedules,
  recomputeScheduleWithGroupChange,
  TargetCourseInput,
} from "@/lib/analysis/scheduleFinder";
import { logAdvisorAction } from "@/lib/logging/auditLogger";
import { TimetableGrid } from "./TimetableGrid";
import { ScheduleUploader } from "./ScheduleUploader";

interface ScheduleFinderModalProps {
  isOpen: boolean;
  onClose: () => void;
  report: AnalysisReport;
  department: Department;
  additionalCourses?: Course[]; // selected electives or additional courses
}

const EMPTY_COURSES: Course[] = [];

export function ScheduleFinderModal({
  isOpen,
  onClose,
  report,
  department,
  additionalCourses = EMPTY_COURSES,
}: ScheduleFinderModalProps) {
  const [schedules, setSchedules] = useState<GroupSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBaseGroup, setSelectedBaseGroup] = useState<string>("");
  const [courseGroupOverrides, setCourseGroupOverrides] = useState<Record<string, string>>({});
  const [showUploader, setShowUploader] = useState(false);
  const [customTargetCourses, setCustomTargetCourses] = useState<TargetCourseInput[] | null>(null);
  const [swappingCourseCode, setSwappingCourseCode] = useState<string | null>(null);
  const [isAddingCourse, setIsAddingCourse] = useState(false);
  const hasLoggedViewRef = useRef(false);

  const hasInProgressCourses = Boolean(report.ungradedCourses && report.ungradedCourses.length > 0);

  // Full pool of courses available to register for this student
  const availableCoursesPool = useMemo(() => {
    const map = new Map<string, { code: string; title: string; category: string }>();

    const add = (courses: { code?: string; title: string }[] | undefined, category: string) => {
      (courses || []).forEach((c) => {
        const code = (c.code || "").trim();
        if (!code) return;
        const norm = code.toUpperCase();
        if (!map.has(norm)) {
          map.set(norm, {
            code,
            title: c.title,
            category,
          });
        }
      });
    };

    if (hasInProgressCourses) {
      add(report.ungradedCourses, "Currently Enrolled (U)");
    }
    add(report.recommendedCourses, "Recommended Core");
    add(report.otherEligibleCourses, "Other Eligible Core");
    add(report.availableCourses, "Available Core");
    add(report.availableMajorElectives, "Major Elective");
    add(report.availableScienceElectives, "Science Elective");
    add(report.availableUniversityRequirements, "University Requirement");
    add(report.availableProfessionalTraining, "Professional Training");

    return Array.from(map.values());
  }, [report, hasInProgressCourses]);

  // Grouped pool by category for optgroup rendering
  const poolByCategory = useMemo(() => {
    const groups: Record<string, { code: string; title: string }[]> = {};
    for (const c of availableCoursesPool) {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    }
    return groups;
  }, [availableCoursesPool]);

  // Stable key for course inputs to prevent unnecessary recalculations
  const coursesKey = useMemo(() => {
    const ungr = (report.ungradedCourses || []).map((c) => c.code).join(";");
    const rec = (report.recommendedCourses || []).map((c) => c.code).join(";");
    const add = additionalCourses.map((c) => c.code).join(";");
    return `${report.studentID}_${ungr}_${rec}_${add}`;
  }, [report.studentID, report.ungradedCourses, report.recommendedCourses, additionalCourses]);

  // Default target courses:
  // If student has courses Currently Enrolled & In Progress (courses marked with U), use those.
  // Otherwise, default to recommended courses from report + any chosen electives/training.
  const defaultTargetCourses: TargetCourseInput[] = useMemo(() => {
    const combined: TargetCourseInput[] = [];
    const seen = new Set<string>();

    const addCourse = (c: { code?: string; title: string }) => {
      const code = (c.code || "").trim();
      if (!code || seen.has(code.toUpperCase())) return;
      seen.add(code.toUpperCase());
      combined.push({ code, title: c.title });
    };

    if (hasInProgressCourses) {
      report.ungradedCourses.forEach(addCourse);
    } else {
      (report.recommendedCourses || []).forEach(addCourse);
      additionalCourses.forEach(addCourse);

      if (combined.length === 0 && report.availableCourses) {
        report.availableCourses.slice(0, 5).forEach(addCourse);
      }
    }

    return combined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coursesKey, report.availableCourses, report.ungradedCourses, hasInProgressCourses]);

  // Active target courses: custom if modified by advisor, otherwise default
  const activeTargetCourses = useMemo(() => {
    return customTargetCourses || defaultTargetCourses;
  }, [customTargetCourses, defaultTargetCourses]);

  // Load all schedules (default + custom)
  const refreshSchedules = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getAllSchedules();
      setSchedules(list);
    } catch (err) {
      console.error("Failed to load schedules:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      refreshSchedules();
    }
  }, [isOpen, refreshSchedules]);

  // Generate solutions for all candidate base groups
  const allSolutions = useMemo(() => {
    if (schedules.length === 0 || activeTargetCourses.length === 0) return [];
    return findSchedules({
      studentDepartment: department,
      targetCourses: activeTargetCourses,
      allGroups: schedules,
    });
  }, [schedules, activeTargetCourses, department]);

  // Determine effective base group
  const effectiveBaseGroup = useMemo(() => {
    if (selectedBaseGroup && allSolutions.some((s) => s.baseGroup === selectedBaseGroup)) {
      return selectedBaseGroup;
    }
    return allSolutions[0]?.baseGroup || "";
  }, [selectedBaseGroup, allSolutions]);

  // Compute active solution with any user manual group overrides applied
  const currentSolution = useMemo(() => {
    if (allSolutions.length === 0) return null;
    const baseSol =
      allSolutions.find((s) => s.baseGroup === effectiveBaseGroup) || allSolutions[0];
    if (!baseSol) return null;

    let sol = baseSol;
    for (const [code, grpName] of Object.entries(courseGroupOverrides)) {
      sol = recomputeScheduleWithGroupChange(sol, code, grpName, schedules);
    }
    return sol;
  }, [allSolutions, effectiveBaseGroup, courseGroupOverrides, schedules]);

  // Audit log: Record schedule view when solutions are computed and modal is active
  useEffect(() => {
    if (!isOpen) {
      hasLoggedViewRef.current = false;
      return;
    }
    if (isOpen && currentSolution && !hasLoggedViewRef.current) {
      hasLoggedViewRef.current = true;
      logAdvisorAction({
        action: "SCHEDULE_VIEWED",
        studentId: report.studentID,
        studentName: report.studentName,
        department,
        metadata: {
          baseGroup: currentSolution.baseGroup,
          semester: currentSolution.semester,
          totalCourses: currentSolution.totalCoursesCount,
          coveredInBase: currentSolution.coveredInBaseCount,
          hasConflicts: currentSolution.hasConflicts,
          conflictCoursesCount: currentSolution.conflictCourses.length,
          solutionsCount: allSolutions.length,
          courses: currentSolution.assignments.map((a) => a.courseCode),
        },
      });
    }
  }, [isOpen, currentSolution, report.studentID, report.studentName, department, allSolutions.length]);

  // Candidate base groups for dropdown selector
  const candidateBaseGroups = useMemo(() => {
    if (!currentSolution || schedules.length === 0) return [];
    return schedules
      .filter((g) => g.semester === currentSolution.semester)
      .map((g) => g.groupName)
      .sort();
  }, [schedules, currentSolution]);

  // Handle base group change from dropdown
  const handleBaseGroupChange = (newBase: string) => {
    const prevBase = effectiveBaseGroup;
    setSelectedBaseGroup(newBase);
    setCourseGroupOverrides({}); // reset individual overrides when changing base group
    logAdvisorAction({
      action: "SCHEDULE_GROUP_CHANGED",
      studentId: report.studentID,
      studentName: report.studentName,
      department,
      metadata: {
        changeType: "base_group",
        previousBaseGroup: prevBase,
        newBaseGroup: newBase,
      },
    });
  };

  // Handle manual group change for an individual course
  const handleCourseGroupChange = (courseCode: string, newGroupName: string) => {
    setCourseGroupOverrides((prev) => ({
      ...prev,
      [courseCode]: newGroupName,
    }));
    logAdvisorAction({
      action: "SCHEDULE_GROUP_CHANGED",
      studentId: report.studentID,
      studentName: report.studentName,
      department,
      metadata: {
        changeType: "course_override",
        courseCode,
        newGroupName,
      },
    });
  };

  // Swap a course with another course from the available pool
  const handleSwapCourse = (oldCode: string, newCode: string) => {
    const selected = availableCoursesPool.find(
      (c) => c.code.toUpperCase() === newCode.toUpperCase()
    );
    if (!selected) return;

    setCustomTargetCourses((prev) => {
      const currentList = prev || defaultTargetCourses;
      return currentList.map((c) =>
        c.code.toUpperCase() === oldCode.toUpperCase()
          ? { code: selected.code, title: selected.title }
          : c
      );
    });

    setCourseGroupOverrides({});
    setSwappingCourseCode(null);
  };

  // Add a new course from the available pool
  const handleAddCourse = (newCode: string) => {
    const selected = availableCoursesPool.find(
      (c) => c.code.toUpperCase() === newCode.toUpperCase()
    );
    if (!selected) return;

    setCustomTargetCourses((prev) => {
      const currentList = prev || defaultTargetCourses;
      if (currentList.some((c) => c.code.toUpperCase() === newCode.toUpperCase())) {
        return currentList;
      }
      return [...currentList, { code: selected.code, title: selected.title }];
    });

    setCourseGroupOverrides({});
    setIsAddingCourse(false);
  };

  // Remove a course from the schedule
  const handleRemoveCourse = (codeToRemove: string) => {
    setCustomTargetCourses((prev) => {
      const currentList = prev || defaultTargetCourses;
      return currentList.filter(
        (c) => c.code.toUpperCase() !== codeToRemove.toUpperCase()
      );
    });
    setCourseGroupOverrides({});
  };

  // Reset back to original recommended courses
  const handleResetTargetCourses = () => {
    setCustomTargetCourses(null);
    setCourseGroupOverrides({});
    setSwappingCourseCode(null);
    setIsAddingCourse(false);
  };

  const handlePrint = () => {
    logAdvisorAction({
      action: "SCHEDULE_PRINTED",
      studentId: report.studentID,
      studentName: report.studentName,
      department,
      metadata: {
        baseGroup: currentSolution?.baseGroup || effectiveBaseGroup,
        semester: currentSolution?.semester,
        coursesCount: currentSolution?.assignments?.length || 0,
        hasConflicts: currentSolution?.hasConflicts || false,
        conflictCourses: currentSolution?.conflictCourses || [],
        assignments: currentSolution?.assignments?.map((a) => ({
          courseCode: a.courseCode,
          groupName: a.assignedGroup,
          isAlternative: a.isAlternativeGroup,
        })),
      },
    });
    window.print();
  };

  if (!isOpen) return null;

  return (

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 backdrop-blur-xs">
      <div className="flex h-[92vh] w-full max-w-7xl flex-col rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden print:m-0 print:h-auto print:w-full print:border-none print:shadow-none">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-6 py-3.5 print:hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white font-bold text-sm shadow-xs">
              📅
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">Schedule Finder</h2>
                <span className="rounded bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-800">
                  {department}
                </span>
                {hasInProgressCourses && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800 border border-amber-300">
                    <span>⏳</span>
                    <span>Currently Enrolled (U)</span>
                  </span>
                )}
                <span className="rounded bg-red-100 px-2 py-0.5 text-[13px] font-bold text-red-800">
                  Experimental Feature
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {report.studentName} ({report.studentID}) · Automatic Group & Conflict Matching
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowUploader(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              title="Upload new semester timetable PDFs"
            >
              <span>📁</span>
              <span>Manage Schedules</span>
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
            >
              <span>🖨️</span>
              <span>Print Timetable</span>
            </button>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        {showUploader ? (
          <div className="flex-1 overflow-y-auto">
            <ScheduleUploader
              onSchedulesUpdated={() => {
                refreshSchedules();
              }}
              onClose={() => setShowUploader(false)}
            />
          </div>
        ) : loading ? (
          <div className="flex flex-1 items-center justify-center p-12">
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-blue-600 border-t-transparent" />
              <span className="text-xs font-medium text-slate-500">Matching timetable groups...</span>
            </div>
          </div>
        ) : !currentSolution ? (
          <div className="flex flex-1 flex-col items-center justify-center p-12 text-center">
            <div className="text-3xl mb-2">📋</div>
            <h3 className="text-sm font-bold text-slate-800">No matching schedules found</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md">
              No timetable groups were found matching the department and {hasInProgressCourses ? "currently enrolled courses" : "recommended courses"}.
              You can upload semester timetable PDFs using the Manage Schedules button.
            </p>
            <button
              onClick={() => setShowUploader(true)}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              Upload Schedule PDF
            </button>
          </div>
        ) : (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Control Bar: Base Group Selector & Summary KPIs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-2.5 shrink-0 print:hidden">
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-slate-700">Primary Base Group:</label>
                <select
                  value={effectiveBaseGroup}
                  onChange={(e) => handleBaseGroupChange(e.target.value)}
                  className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-800 focus:border-blue-500 focus:outline-none"
                >
                  {candidateBaseGroups.map((grpName) => (
                    <option key={grpName} value={grpName}>
                      {grpName} {grpName === allSolutions[0]?.baseGroup ? "(Recommended)" : ""}
                    </option>
                  ))}
                </select>

                <span className="text-[11px] text-slate-500">
                  (Term {currentSolution.semester} {currentSolution.department})
                </span>
              </div>

              {/* Status Pills */}
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 border border-blue-200">
                  <span>🎯</span>
                  <span>{currentSolution.coveredInBaseCount} of {currentSolution.totalCoursesCount} from {currentSolution.baseGroup}</span>
                </span>

                {currentSolution.assignments.some((a) => a.isAlternativeGroup) && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800 border border-amber-200">
                    <span>🔄</span>
                    <span>
                      {currentSolution.assignments.filter((a) => a.isAlternativeGroup).length} from Alt Groups
                    </span>
                  </span>
                )}

                {currentSolution.hasConflicts ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-700 border border-red-200">
                    <span>⚠️</span>
                    <span>{currentSolution.conflictCourses.length} Conflict(s)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                    <span>✅</span>
                    <span>100% Conflict-Free</span>
                  </span>
                )}
              </div>
            </div>

            {/* Main Content: Split Cockpit View */}
            <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-12">
              {/* Left Column: Course Assignments & Group Pickers */}
              <div className="flex flex-col border-r border-slate-200 bg-slate-50/40 p-4 lg:col-span-4 overflow-y-auto print:hidden">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Course Registrations ({currentSolution.assignments.length})
                    </h3>
                    {hasInProgressCourses && customTargetCourses === null && (
                      <span className="text-[11px] text-amber-700 font-semibold block mt-0.5">
                        ⏳ Enrolled & In Progress (U)
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400">Tap group to change</span>
                </div>

                <div className="flex flex-col gap-2.5">
                  {currentSolution.assignments.map((as) => {
                    const isConflict = !!as.conflictWith && as.conflictWith.length > 0;
                    const isSwapping = swappingCourseCode === as.courseCode;

                    return (
                      <div
                        key={as.courseCode}
                        className={`rounded-xl border p-3 shadow-2xs transition-all ${isConflict
                          ? "border-red-300 bg-red-50/60"
                          : as.isAlternativeGroup
                            ? "border-amber-200 bg-amber-50/30"
                            : "border-slate-200 bg-white"
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-xs text-slate-900">
                                {as.courseCode}
                              </span>
                              {as.isAlternativeGroup ? (
                                <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[9px] font-bold text-amber-800 border border-amber-200">
                                  Term {as.targetTerm} Placement
                                </span>
                              ) : (
                                <span className="rounded bg-blue-100 px-1.5 py-0.2 text-[9px] font-bold text-blue-800">
                                  Base Group
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-600 line-clamp-1 mt-0.5 font-medium">
                              {as.courseTitle}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            {/* Group Selector Dropdown */}
                            <select
                              value={as.assignedGroup}
                              onChange={(e) => handleCourseGroupChange(as.courseCode, e.target.value)}
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-2xs"
                              title="Switch timetable group for this course"
                            >
                              {as.candidateGroups.map((cg) => (
                                <option key={cg.groupName} value={cg.groupName}>
                                  {cg.groupName} {cg.hasConflict ? "⚠️ (Conflict)" : "✓ (OK)"}
                                </option>
                              ))}
                            </select>

                            {/* Remove Course Button */}
                            <button
                              onClick={() => handleRemoveCourse(as.courseCode)}
                              title="Remove course from schedule"
                              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Inline Subject Replacement Selector */}
                        {isSwapping ? (
                          <div className="mt-2.5 rounded-lg border border-blue-200 bg-blue-50/70 p-2 text-xs">
                            <label className="text-[11px] font-bold text-blue-900 block mb-1">
                              Replace with Course from Available Pool:
                            </label>
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleSwapCourse(as.courseCode, e.target.value);
                                }
                              }}
                              className="w-full rounded border border-blue-300 bg-white p-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="" disabled>-- Select available subject --</option>
                              {Object.entries(poolByCategory).map(([cat, courses]) => {
                                const eligibleCourses = courses.filter(
                                  (c) =>
                                    !currentSolution.assignments.some(
                                      (curr) => curr.courseCode.toUpperCase() === c.code.toUpperCase()
                                    )
                                );
                                if (eligibleCourses.length === 0) return null;
                                return (
                                  <optgroup key={cat} label={cat}>
                                    {eligibleCourses.map((c) => (
                                      <option key={c.code} value={c.code}>
                                        {c.code} · {c.title}
                                      </option>
                                    ))}
                                  </optgroup>
                                );
                              })}
                            </select>
                            <div className="mt-1 flex justify-end">
                              <button
                                onClick={() => setSwappingCourseCode(null)}
                                className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          /* Action to Change Subject */
                          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-1 text-[11px]">
                            <button
                              onClick={() => setSwappingCourseCode(as.courseCode)}
                              className="flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 hover:underline transition-colors"
                            >
                              <span>🔄</span>
                              <span>Change Subject...</span>
                            </button>
                            <span className="text-[10px] text-slate-400">
                              {as.slots.length} session{as.slots.length === 1 ? "" : "s"} / week
                            </span>
                          </div>
                        )}

                        {/* Scheduled Slots summary */}
                        <div className="mt-1.5 flex flex-wrap items-center gap-1">
                          {as.slots.map((s, idx) => (
                            <span
                              key={idx}
                              className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                            >
                              {s.day} Period {s.period}
                            </span>
                          ))}
                        </div>

                        {/* Conflict Banner if any */}
                        {isConflict && (
                          <div className="mt-2 rounded bg-red-100/80 p-1.5 text-[10px] font-semibold text-red-700">
                            ⚠️ Overlaps with {as.conflictWith?.join(", ")}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add Subject or Reset Controls */}
                  {isAddingCourse ? (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3 shadow-2xs">
                      <label className="text-xs font-bold text-blue-900 block mb-1">
                        Add Subject from Available to Register Pool:
                      </label>
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAddCourse(e.target.value);
                          }
                        }}
                        className="w-full rounded-lg border border-blue-300 bg-white p-1.5 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="" disabled>-- Select a course to add --</option>
                        {Object.entries(poolByCategory).map(([cat, courses]) => {
                          const eligibleCourses = courses.filter(
                            (c) =>
                              !currentSolution.assignments.some(
                                (curr) => curr.courseCode.toUpperCase() === c.code.toUpperCase()
                              )
                          );
                          if (eligibleCourses.length === 0) return null;
                          return (
                            <optgroup key={cat} label={cat}>
                              {eligibleCourses.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.code} · {c.title}
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                      <div className="mt-2 flex justify-end">
                        <button
                          onClick={() => setIsAddingCourse(false)}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-800 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => setIsAddingCourse(true)}
                        className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-dashed border-blue-300 bg-blue-50/50 py-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 hover:border-blue-400 transition-colors shadow-2xs"
                      >
                        <span>➕</span>
                        <span>Add Subject from Available Pool</span>
                      </button>
                      {customTargetCourses !== null && (
                        <button
                          onClick={handleResetTargetCourses}
                          title={hasInProgressCourses ? "Reset back to currently enrolled courses (U)" : "Reset back to default recommended courses"}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors shadow-2xs"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>


              {/* Right Column: Weekly Timetable Grid */}
              <div className="flex flex-col p-4 lg:col-span-8 overflow-y-auto print:col-span-12 print:p-0">
                <div className="mb-2 flex items-center justify-between print:hidden">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Weekly Schedule Matrix (Sat – Thu)
                  </h3>
                  <span className="text-[11px] text-slate-400">AAST CCIT Timetable Layout</span>
                </div>

                {/* Printable Header for Browser Print */}
                <div className="hidden print:block mb-4">
                  <h1 className="text-lg font-bold text-slate-900">Student Semester Timetable</h1>
                  <p className="text-xs text-slate-600">
                    {report.studentName} ({report.studentID}) · Department: {department} · Base Group: {currentSolution.baseGroup}
                  </p>
                </div>

                <TimetableGrid solution={currentSolution} className="flex-1" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
