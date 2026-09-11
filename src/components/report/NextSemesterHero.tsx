"use client";

import { useState, useMemo, useEffect } from "react";
import { AnalysisReport } from "@/types";
import {
  PROBATION_HALF_LOAD_CREDITS,
  NORMAL_LOAD_UPPER_YEARS,
  NORMAL_LOAD_LOWER_YEARS,
  YEAR_UPPER_CREDIT_THRESHOLD,
  YEAR_FOUR_CREDIT_THRESHOLD,
  PRACTICAL_TRAINING_CODE,
  PRACTICAL_TRAINING_MIN_CREDIT_HOURS,
  getCourseCredits,
  canonicalizeCode,
} from "@/lib/constants";
import { DashCard, CardEmpty } from "./DashCard";
import { CourseRow } from "./CourseRow";
import { RegisterSection } from "./RegisterSection";

interface NextSemesterHeroProps {
  report: AnalysisReport;
  className?: string;
  onOpenSchedule?: () => void;
}

export function NextSemesterHero({
  report,
  className = "",
  onOpenSchedule,
}: NextSemesterHeroProps) {

  // Determine standard cap and academic standing
  const cap = report.onProbation
    ? PROBATION_HALF_LOAD_CREDITS
    : report.totalCreditHours >= YEAR_UPPER_CREDIT_THRESHOLD
    ? NORMAL_LOAD_UPPER_YEARS
    : NORMAL_LOAD_LOWER_YEARS;

  const yearLevel = useMemo(() => {
    if (report.totalCreditHours < 33) return "Year 1 (Freshman)";
    if (report.totalCreditHours < 69) return "Year 2 (Sophomore)";
    if (report.totalCreditHours < 99) return "Year 3 (Junior)";
    return "Year 4 (Senior)";
  }, [report.totalCreditHours]);

  // Determine how many Major Elective slots to recommend in the main schedule
  const numMajorElectiveSlots = useMemo(() => {
    if (report.remainingMajorElectives <= 0 || report.availableMajorElectives.length === 0) {
      return 0;
    }
    // Year 4 students have 2 major electives per semester in standard curriculum
    if (report.totalCreditHours >= 99) {
      return Math.min(2, report.remainingMajorElectives);
    }
    // Year 3 or if remaining
    if (report.totalCreditHours >= 66 || report.recommendedCourses.length < 5) {
      return Math.min(1, report.remainingMajorElectives);
    }
    return 0;
  }, [report]);

  // Determine if Professional Training is recommended this semester
  const showTrainingSlot = useMemo(() => {
    return (
      report.remainingProfessionalTraining > 0 &&
      report.availableProfessionalTraining.length > 0 &&
      (report.totalCreditHours >= 60 || report.recommendedCourses.length < 5)
    );
  }, [report]);

  // Determine if student is in their last year (Year 4 / Senior, or entering Year 4 next semester)
  const isLastYear = useMemo(() => {
    return (
      report.totalCreditHours >= YEAR_FOUR_CREDIT_THRESHOLD ||
      report.expectedCreditHours >= YEAR_FOUR_CREDIT_THRESHOLD ||
      report.creditHoursToGraduation <= 33 ||
      report.practicalTrainingWarning
    );
  }, [
    report.totalCreditHours,
    report.expectedCreditHours,
    report.creditHoursToGraduation,
    report.practicalTrainingWarning,
  ]);

  // Determine if Practical Training is recommended this semester
  const showPracticalTraining = useMemo(() => {
    if (report.practicalTrainingCompleted || report.practicalTrainingUngraded) {
      return false;
    }
    return (
      isLastYear &&
      (report.practicalTrainingEligible || report.totalCreditHours >= PRACTICAL_TRAINING_MIN_CREDIT_HOURS)
    );
  }, [
    isLastYear,
    report.practicalTrainingCompleted,
    report.practicalTrainingUngraded,
    report.practicalTrainingEligible,
    report.totalCreditHours,
  ]);

  const ptCanonCode = useMemo(() => canonicalizeCode(PRACTICAL_TRAINING_CODE), []);

  // Filter Practical Training from core lists to avoid duplicate entries when displayed as dedicated slot
  const recommendedCoreCourses = useMemo(() => {
    if (!showPracticalTraining) return report.recommendedCourses;
    return report.recommendedCourses.filter((c) => canonicalizeCode(c.code) !== ptCanonCode);
  }, [report.recommendedCourses, showPracticalTraining, ptCanonCode]);

  const otherEligibleCoreCourses = useMemo(() => {
    if (!showPracticalTraining) return report.otherEligibleCourses;
    return report.otherEligibleCourses.filter((c) => canonicalizeCode(c.code) !== ptCanonCode);
  }, [report.otherEligibleCourses, showPracticalTraining, ptCanonCode]);

  // Initial chosen major electives per slot: unselected by default so advisor chooses
  const initialMajorElectives = useMemo(() => {
    return Array(numMajorElectiveSlots).fill("");
  }, [numMajorElectiveSlots]);

  // Initial chosen professional training
  const initialTraining = useMemo(() => {
    if (!showTrainingSlot || report.availableProfessionalTraining.length === 0) return "";
    const first = report.availableProfessionalTraining[0];
    return first.code || first.title;
  }, [showTrainingSlot, report.availableProfessionalTraining]);

  // State for chosen elective in each slot
  const [slotElectives, setSlotElectives] = useState<string[]>(initialMajorElectives);
  // State for chosen training
  const [slotTraining, setSlotTraining] = useState<string>(initialTraining);

  // Sync state when report / department changes
  useEffect(() => {
    setSlotElectives(initialMajorElectives);
    setSlotTraining(initialTraining);
  }, [initialMajorElectives, initialTraining]);

  // Default selected codes: Core + Initial Major Electives + Initial Training + Practical Training
  const defaultSelectedCodes = useMemo(() => {
    const set = new Set<string>();
    recommendedCoreCourses.forEach((c) => set.add(canonicalizeCode(c.code)));
    initialMajorElectives.forEach((code) => {
      if (code) set.add(canonicalizeCode(code));
    });
    if (initialTraining) {
      set.add(canonicalizeCode(initialTraining));
    }
    if (showPracticalTraining) {
      set.add(ptCanonCode);
    }
    return set;
  }, [recommendedCoreCourses, initialMajorElectives, initialTraining, showPracticalTraining, ptCanonCode]);

  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(defaultSelectedCodes);
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [retakesExpanded, setRetakesExpanded] = useState<boolean>(false);
  const [expandedSlotReasons, setExpandedSlotReasons] = useState<Record<string, boolean>>({});

  const selectedRetakesCount = useMemo(() => {
    return report.retakeRecommendations.filter((c) =>
      selectedCodes.has(canonicalizeCode(c.code))
    ).length;
  }, [report.retakeRecommendations, selectedCodes]);

  // Sync selectedCodes when defaultSelectedCodes changes (e.g. department switch)
  useEffect(() => {
    setSelectedCodes(new Set(defaultSelectedCodes));
  }, [defaultSelectedCodes]);

  // Handle changing an elective in a specific slot
  const handleSlotElectiveChange = (slotIndex: number, newCode: string) => {
    const oldCode = slotElectives[slotIndex];
    const nextSlots = [...slotElectives];
    nextSlots[slotIndex] = newCode;
    setSlotElectives(nextSlots);

    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (oldCode) next.delete(canonicalizeCode(oldCode));
      if (newCode) next.add(canonicalizeCode(newCode));
      return next;
    });
  };

  // Handle changing professional training slot
  const handleSlotTrainingChange = (newKey: string) => {
    const oldKey = slotTraining;
    setSlotTraining(newKey);

    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (oldKey) next.delete(canonicalizeCode(oldKey));
      if (newKey) next.add(canonicalizeCode(newKey));
      return next;
    });
  };

  // Toggle selection of any course
  const toggleCourse = (code: string) => {
    const canonical = canonicalizeCode(code);
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(canonical)) {
        next.delete(canonical);
      } else {
        next.add(canonical);
      }
      return next;
    });
  };

  const handleResetToDefault = () => {
    setSlotElectives(initialMajorElectives);
    setSlotTraining(initialTraining);
    setSelectedCodes(new Set(defaultSelectedCodes));
  };

  // Map of all selectable courses across pools for lookup
  const allCandidateCourses = useMemo(() => {
    const map = new Map<string, { code: string; title: string; credits: number; source: string }>();

    report.recommendedCourses.forEach((c) => {
      map.set(canonicalizeCode(c.code), {
        code: c.code,
        title: c.title,
        credits: getCourseCredits(c.code),
        source: "Recommended Core",
      });
    });

    report.otherEligibleCourses.forEach((c) => {
      if (!map.has(canonicalizeCode(c.code))) {
        map.set(canonicalizeCode(c.code), {
          code: c.code,
          title: c.title,
          credits: getCourseCredits(c.code),
          source: "Eligible Core",
        });
      }
    });

    report.availableMajorElectives.forEach((c) => {
      if (!map.has(canonicalizeCode(c.code))) {
        map.set(canonicalizeCode(c.code), {
          code: c.code,
          title: c.title,
          credits: getCourseCredits(c.code),
          source: "Major Elective",
        });
      }
    });

    report.availableProfessionalTraining.forEach((c) => {
      const codeKey = c.code ? canonicalizeCode(c.code) : c.title;
      if (!map.has(codeKey)) {
        map.set(codeKey, {
          code: c.code,
          title: c.title,
          credits: getCourseCredits(c.code),
          source: "Professional Training",
        });
      }
    });

    report.availableScienceElectives.forEach((c) => {
      if (!map.has(canonicalizeCode(c.code))) {
        map.set(canonicalizeCode(c.code), {
          code: c.code,
          title: c.title,
          credits: getCourseCredits(c.code),
          source: "Science Elective",
        });
      }
    });

    report.availableUniversityRequirements.forEach((c) => {
      if (!map.has(canonicalizeCode(c.code))) {
        map.set(canonicalizeCode(c.code), {
          code: c.code,
          title: c.title,
          credits: getCourseCredits(c.code),
          source: "University Req",
        });
      }
    });

    report.retakeRecommendations.forEach((r) => {
      if (!map.has(canonicalizeCode(r.code))) {
        map.set(canonicalizeCode(r.code), {
          code: r.code,
          title: r.title,
          credits: getCourseCredits(r.code),
          source: `Retake (${r.grade})`,
        });
      }
    });

    if (showPracticalTraining) {
      if (!map.has(ptCanonCode)) {
        map.set(ptCanonCode, {
          code: PRACTICAL_TRAINING_CODE,
          title: "Practical Training",
          credits: getCourseCredits(PRACTICAL_TRAINING_CODE),
          source: "Practical Training",
        });
      }
    }

    return map;
  }, [report, showPracticalTraining, ptCanonCode]);

  // Calculate live selected credit total
  const selectedSummary = useMemo(() => {
    let totalCredits = 0;
    let count = 0;
    selectedCodes.forEach((code) => {
      const item = allCandidateCourses.get(code);
      if (item) {
        totalCredits += item.credits;
        count++;
      }
    });
    return { totalCredits, count };
  }, [selectedCodes, allCandidateCourses]);

  const isOverCap = selectedSummary.totalCredits > cap;
  const isAtCap = selectedSummary.totalCredits === cap;
  const progressPercent = Math.min(100, Math.round((selectedSummary.totalCredits / cap) * 100));

  const totalAvailableAcrossAllPools =
    report.availableCourses.length +
    report.availableMajorElectives.length +
    report.availableScienceElectives.length +
    report.availableUniversityRequirements.length +
    report.availableProfessionalTraining.length +
    (showPracticalTraining ? 1 : 0);

  const totalRecommendedItems =
    recommendedCoreCourses.length +
    numMajorElectiveSlots +
    (showTrainingSlot ? 1 : 0) +
    (showPracticalTraining ? 1 : 0);

  return (
    <DashCard
      title="Next Semester Registration Hub"
      tone="blue"
      badge={`${selectedSummary.totalCredits} / ${cap} Credits`}
      className={className}
      actions={
        <div className="flex items-center gap-2 print:hidden">
          {onOpenSchedule && (
            <button
              type="button"
              onClick={onOpenSchedule}
              className="flex items-center gap-1 rounded border border-blue-600 bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold text-white shadow-xs hover:bg-blue-700 transition-colors"
              title={
                report.ungradedCourses.length > 0
                  ? "Find timetable schedule for currently enrolled & in-progress courses (U)"
                  : "Find timetable schedule and conflict-free groups for recommended courses"
              }
            >
              <span>📅</span>
              <span>Find Schedule</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 transition-colors"
          >
            {showGuide ? "Hide Guide" : "💡 Advising Guide"}
          </button>
          <button
            type="button"
            onClick={handleResetToDefault}
            title="Reset selection to default recommended schedule"
            className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Reset
          </button>
        </div>
      }

    >
      {/* 1. Advising Standing & Registration Blueprint Banner */}
      <div
        className={`mb-3 rounded-xl border p-3 transition-colors ${
          report.onProbation
            ? "border-red-300 bg-red-50 text-red-900"
            : "border-slate-200 bg-slate-50/70 text-slate-900"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {report.onProbation && (
              <span className="rounded-full bg-red-200 px-2 py-0.5 text-xs font-bold text-red-900">
                ⚠️ Academic Probation
              </span>
            )}
            {report.gpa !== null && report.gpa >= 3.0 && !report.onProbation && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                🌟 Overload Eligible (Up to 21 Cr)
              </span>
            )}
            <span className="text-xs font-semibold text-slate-700">
              {yearLevel} · {report.department} Plan
            </span>
          </div>

          <div className="text-xs font-bold text-slate-700">
            Max Load: <span className="font-mono text-sm font-bold text-slate-900">{cap} Cr.</span>
          </div>
        </div>

        {/* Live Credit Progress Bar */}
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>
              Live Registration Basket:{" "}
              <span className="font-mono font-bold text-sm">
                {selectedSummary.totalCredits}
              </span>{" "}
              / {cap} Cr. ({selectedSummary.count} course
              {selectedSummary.count === 1 ? "" : "s"} selected)
            </span>
            <span
              className={`text-[11px] font-bold ${
                isOverCap
                  ? "text-red-700 font-bold"
                  : isAtCap
                  ? "text-emerald-700 font-bold"
                  : "text-slate-600"
              }`}
            >
              {isOverCap
                ? `⚠ Exceeds cap by ${selectedSummary.totalCredits - cap} Cr.`
                : isAtCap
                ? "Full standard load reached"
                : `${cap - selectedSummary.totalCredits} Cr. remaining`}
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full transition-all duration-300 ${
                isOverCap
                  ? "bg-red-500"
                  : isAtCap
                  ? "bg-emerald-500"
                  : "bg-blue-600"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {report.onProbation && (
          <p className="mt-2 text-[11px] leading-tight text-red-800 font-medium">
            Strict half-load enforced: max 12 credit hours. Project I is blocked
            until cumulative G.P.A reaches 2.0.
          </p>
        )}
      </div>

      {/* 2. In-Progress Courses (Prominent view of currently ongoing courses) */}
      {report.ungradedCourses.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-1 border-b border-amber-200/80 pb-1.5 mb-2">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[11px] text-white font-bold">
                ⏳
              </span>
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-950">
                Currently Enrolled & In Progress ({report.ungradedCourses.length} Course{report.ungradedCourses.length === 1 ? "" : "s"})
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-200 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-900">
                +{report.expectedCreditHours - report.totalCreditHours} Cr. Pending
              </span>
              {onOpenSchedule && (
                <button
                  type="button"
                  onClick={onOpenSchedule}
                  className="flex items-center gap-1 rounded bg-amber-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-2xs hover:bg-amber-700 transition-colors"
                  title="View timetable schedule for currently enrolled courses (U)"
                >
                  <span>📅 View Schedule</span>
                </button>
              )}
            </div>
          </div>

          <p className="mb-2 text-[11px] leading-snug text-amber-900 font-medium">
            Student is actively taking these subjects this semester. Grades have not posted yet (Grade: <strong>U</strong>). Upcoming recommendations assume these will be passed:
          </p>

          <ul className="space-y-1">
            {report.ungradedCourses.map((course, idx) => (
              <CourseRow
                key={`hero-ungraded-${idx}`}
                code={course.code}
                title={course.title}
                credits={getCourseCredits(course.code)}
                meta={course.semester?.label ? `Enrolled in ${course.semester.label}` : "Current Term"}
                tag="U · In Progress"
                tagTone="amber"
                tone="amber"
              />
            ))}
          </ul>
        </div>
      )}

      {/* Guided 4-Step Checklist for Advisors */}
      {showGuide && (
        <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50/40 p-3 text-xs text-slate-700">
          <h4 className="font-bold text-blue-900 mb-1.5 flex items-center gap-1">
            <span>📋</span> Advisor Next-Semester Checklist
          </h4>
          <ol className="list-decimal list-inside space-y-1 text-[11px] leading-snug text-slate-600">
            <li>
              <strong className="text-slate-800">Check Max Load:</strong> Ensure total credits do not exceed {cap} Cr. (Half-load if on probation).
            </li>
            <li>
              <strong className="text-slate-800">Review Core Schedule:</strong> Core courses due for this semester are pre-selected in Section A.
            </li>
            <li>
              <strong className="text-slate-800">Select Major Electives & Training:</strong> Use the slot dropdowns in Section A to pick the student&apos;s chosen major electives, professional training, and practical training (for final-year students).
            </li>
            <li>
              <strong className="text-slate-800">Address Retakes or Other Pools:</strong> If GPA is weak, check recommended retakes or explore secondary pools below.
            </li>
          </ol>
        </div>
      )}

      {totalAvailableAcrossAllPools === 0 ? (
        <CardEmpty>No available courses to register at this time.</CardEmpty>
      ) : (
        <div className="space-y-2">
          {/* SECTION A: Primary Recommended Schedule (Core + Major Elective Slots + Professional Training) */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/20 p-2.5">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white font-bold">
                    A
                  </span>
                  Recommended Semester Schedule
                </h4>
                <p className="text-[11px] text-slate-500">
                  Packaged schedule for next semester: Core requirements, Major Elective slots, and Professional &amp; Practical Training.
                </p>
              </div>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-800">
                {totalRecommendedItems} course{totalRecommendedItems === 1 ? "" : "s"}
              </span>
            </div>

            {totalRecommendedItems === 0 ? (
              <p className="py-1 text-xs italic text-slate-400">
                No courses recommended for this semester (check electives or retakes below).
              </p>
            ) : (
              <div className="space-y-1.5">
                {/* 1. Core Courses */}
                {recommendedCoreCourses.map((course, idx) => {
                  const codeKey = canonicalizeCode(course.code);
                  const isSelected = selectedCodes.has(codeKey);
                  const credits = getCourseCredits(course.code);

                  return (
                    <CourseRow
                      key={`rec-core-${idx}`}
                      code={course.code}
                      title={course.title}
                      credits={credits}
                      badge="Priority Core"
                      badgeTone="blue"
                      tone="blue"
                      selectable
                      selected={isSelected}
                      onToggle={() => toggleCourse(course.code)}
                      recommendationReason={course.recommendationReason}
                    />
                  );
                })}

                {/* 2. Major Elective Slots (interactive dropdown selector) */}
                {Array.from({ length: numMajorElectiveSlots }).map((_, slotIdx) => {
                  const chosenCode = slotElectives[slotIdx] || "";
                  const canonicalChosen = canonicalizeCode(chosenCode);
                  const isSelected = chosenCode !== "" && selectedCodes.has(canonicalChosen);
                  const chosenCourseObj = report.availableMajorElectives.find(
                    (e) => canonicalizeCode(e.code) === canonicalChosen
                  );

                  // Other slots' selected codes to prevent picking duplicates
                  const otherChosen = slotElectives
                    .filter((_, idx) => idx !== slotIdx)
                    .map((c) => canonicalizeCode(c));

                  const isSlotReasonExpanded = Boolean(expandedSlotReasons[`major-${slotIdx}`]);

                  return (
                    <div
                      key={`slot-major-${slotIdx}`}
                      className="rounded-lg border border-indigo-200 bg-indigo-50/40 p-2 transition-colors"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (chosenCode) {
                              toggleCourse(chosenCode);
                            }
                          }}
                          disabled={!chosenCode}
                          aria-label={`Toggle Major Elective Slot ${slotIdx + 1}`}
                          className="h-3.5 w-3.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40"
                        />

                        <span className="flex-shrink-0 rounded bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
                          Major Elective {numMajorElectiveSlots > 1 ? `Slot ${slotIdx + 1}` : "Slot"}
                        </span>

                        <div className="min-w-[180px] flex-1">
                          <select
                            value={chosenCode}
                            onChange={(e) => handleSlotElectiveChange(slotIdx, e.target.value)}
                            className="w-full rounded border border-indigo-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900 shadow-sm focus:border-indigo-500 focus:outline-none"
                          >
                            <option value="" className="text-slate-900 bg-white">-- Select Major Elective --</option>
                            {report.availableMajorElectives.map((elective) => (
                              <option
                                key={elective.code}
                                value={elective.code}
                                disabled={otherChosen.includes(canonicalizeCode(elective.code))}
                                className="text-slate-900 bg-white"
                              >
                                {elective.code} · {elective.title}
                              </option>
                            ))}
                          </select>
                        </div>

                        <span className="flex-shrink-0 rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-bold text-indigo-800">
                          3 Cr
                        </span>

                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSlotReasons((prev) => ({
                              ...prev,
                              [`major-${slotIdx}`]: !prev[`major-${slotIdx}`],
                            }))
                          }
                          className={`flex-shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                            isSlotReasonExpanded
                              ? "bg-indigo-200 text-indigo-900 font-bold"
                              : "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                          }`}
                          title="Why is this elective slot recommended?"
                          aria-expanded={isSlotReasonExpanded}
                        >
                          <span>💡 Why?</span>
                          <span
                            className={`inline-block text-[8px] transition-transform duration-200 ${
                              isSlotReasonExpanded ? "rotate-180" : ""
                            }`}
                          >
                            ▼
                          </span>
                        </button>
                      </div>

                      {chosenCourseObj ? (
                        <p className="mt-1 ml-6 text-[10px] font-medium text-indigo-700">
                          Selected: <strong className="font-semibold">{chosenCourseObj.code} · {chosenCourseObj.title}</strong>
                        </p>
                      ) : (
                        <p className="mt-1 ml-6 text-[10px] text-indigo-600 font-medium">
                          ✦ Choose 1 of {report.availableMajorElectives.length} available major electives above to include in the plan.
                        </p>
                      )}

                      {isSlotReasonExpanded && (
                        <div className="mt-2 rounded-lg border border-indigo-200 bg-white/95 p-2.5 text-xs text-slate-700 shadow-xs">
                          <div className="flex items-start gap-2">
                            <span className="text-sm select-none" aria-hidden>
                              💡
                            </span>
                            <div className="flex-1 space-y-1">
                              <p className="font-semibold text-indigo-950">
                                {report.totalCreditHours >= 99
                                  ? "Year 4 Standard Curriculum Allocation"
                                  : "Degree Elective Progress Requirement"}
                              </p>
                              <p className="text-[11px] leading-snug text-slate-600">
                                {report.totalCreditHours >= 99
                                  ? `In Year 4 (Semesters 7 & 8), the department plan allocates 2 major electives per semester alongside core classes. You currently have ${report.remainingMajorElectives} remaining major elective requirement(s) to graduate.`
                                  : `You have ${report.remainingMajorElectives} remaining major elective requirement(s) for your degree. Taking an elective slot this term balances your credit load alongside core coursework.`}
                              </p>
                              <div className="flex flex-wrap gap-1.5 pt-1 text-[10px]">
                                <span className="rounded bg-indigo-100 px-1.5 py-0.5 font-medium text-indigo-800">
                                  {report.remainingMajorElectives} Elective{report.remainingMajorElectives === 1 ? "" : "s"} Needed
                                </span>
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                                  {report.availableMajorElectives.length} Options Available
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* 3. Professional Training Slot (interactive dropdown selector) */}
                {showTrainingSlot && (
                  <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-2 transition-colors">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={slotTraining !== "" && selectedCodes.has(canonicalizeCode(slotTraining))}
                        onChange={() => {
                          if (slotTraining) {
                            toggleCourse(slotTraining);
                          }
                        }}
                        disabled={!slotTraining}
                        aria-label="Toggle Professional Training Slot"
                        className="h-3.5 w-3.5 rounded border-teal-300 text-teal-600 focus:ring-teal-500 disabled:opacity-40"
                      />

                      <span className="flex-shrink-0 rounded bg-teal-600 px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
                        Professional Training Slot
                      </span>

                      <div className="min-w-[180px] flex-1">
                        <select
                          value={slotTraining}
                          onChange={(e) => handleSlotTrainingChange(e.target.value)}
                          className="w-full rounded border border-teal-300 bg-white px-2 py-1 text-xs font-semibold text-slate-900 shadow-sm focus:border-teal-500 focus:outline-none"
                        >
                          <option value="" className="text-slate-900 bg-white">-- Select Professional Training --</option>
                          {report.availableProfessionalTraining.map((t, idx) => {
                            const val = t.code || t.title;
                            return (
                              <option key={idx} value={val} className="text-slate-900 bg-white">
                                {t.code ? `${t.code} · ` : ""}{t.title}
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <span className="flex-shrink-0 rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">
                        Training
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSlotReasons((prev) => ({
                            ...prev,
                            training: !prev["training"],
                          }))
                        }
                        className={`flex-shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                          Boolean(expandedSlotReasons["training"])
                            ? "bg-teal-200 text-teal-900 font-bold"
                            : "bg-teal-100 text-teal-700 hover:bg-teal-200"
                        }`}
                        title="Why is professional training recommended?"
                        aria-expanded={Boolean(expandedSlotReasons["training"])}
                      >
                        <span>💡 Why?</span>
                        <span
                          className={`inline-block text-[8px] transition-transform duration-200 ${
                            expandedSlotReasons["training"] ? "rotate-180" : ""
                          }`}
                        >
                          ▼
                        </span>
                      </button>
                    </div>

                    {slotTraining && (
                      <p className="mt-1 ml-6 text-[10px] font-medium text-teal-800">
                        Selected: <strong className="font-semibold">{slotTraining}</strong>
                      </p>
                    )}

                    {Boolean(expandedSlotReasons["training"]) && (
                      <div className="mt-2 rounded-lg border border-teal-200 bg-white/95 p-2.5 text-xs text-slate-700 shadow-xs">
                        <div className="flex items-start gap-2">
                          <span className="text-sm select-none" aria-hidden>
                            💡
                          </span>
                          <div className="flex-1 space-y-1">
                            <p className="font-semibold text-teal-950">
                              Fixed Professional Training Sequence (Semesters 5–8)
                            </p>
                            <p className="text-[11px] leading-snug text-slate-600">
                              Professional Training courses are sequenced sequentially across the upper years once a student completes 60+ credit hours. You currently have {report.remainingProfessionalTraining} of 4 professional training course(s) left to complete before graduation.
                            </p>
                            <div className="flex flex-wrap gap-1.5 pt-1 text-[10px]">
                              <span className="rounded bg-teal-100 px-1.5 py-0.5 font-medium text-teal-800">
                                {report.remainingProfessionalTraining} of 4 Left
                              </span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                                Upper Year Sequence
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Practical Training Slot (Senior / Final Year Graduation Requirement) */}
                {showPracticalTraining && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2 transition-colors">
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedCodes.has(ptCanonCode)}
                        onChange={() => toggleCourse(PRACTICAL_TRAINING_CODE)}
                        aria-label="Toggle Practical Training (CIT4000)"
                        className="h-3.5 w-3.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />

                      <span className="flex-shrink-0 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white uppercase tracking-wide">
                        Practical Training
                      </span>

                      <span className="flex-shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-emerald-900">
                        {PRACTICAL_TRAINING_CODE}
                      </span>

                      <span className="min-w-0 flex-1 text-xs font-semibold text-slate-900 truncate" title="Practical Training (Field Internship)">
                        Practical Training
                      </span>

                      <span className="flex-shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                        0 Cr · Pass/Fail
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSlotReasons((prev) => ({
                            ...prev,
                            practical: !prev["practical"],
                          }))
                        }
                        className={`flex-shrink-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer ${
                          Boolean(expandedSlotReasons["practical"])
                            ? "bg-emerald-200 text-emerald-900 font-bold"
                            : "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        }`}
                        title="Why is practical training recommended?"
                        aria-expanded={Boolean(expandedSlotReasons["practical"])}
                      >
                        <span>💡 Why?</span>
                        <span
                          className={`inline-block text-[8px] transition-transform duration-200 ${
                            expandedSlotReasons["practical"] ? "rotate-180" : ""
                          }`}
                        >
                          ▼
                        </span>
                      </button>
                    </div>

                    <p className="mt-1 ml-6 text-[10px] font-medium text-emerald-800">
                      Final Year Graduation Requirement: <strong className="font-semibold">{PRACTICAL_TRAINING_CODE} · Practical Training</strong> (Field Internship)
                    </p>

                    {Boolean(expandedSlotReasons["practical"]) && (
                      <div className="mt-2 rounded-lg border border-emerald-200 bg-white/95 p-2.5 text-xs text-slate-700 shadow-xs">
                        <div className="flex items-start gap-2">
                          <span className="text-sm select-none" aria-hidden>
                            💡
                          </span>
                          <div className="flex-1 space-y-1">
                            <p className="font-semibold text-emerald-950">
                              Final-Year Mandatory Practical Training (CIT4000)
                            </p>
                            <p className="text-[11px] leading-snug text-slate-600">
                              Practical Training ({PRACTICAL_TRAINING_CODE}) is a mandatory core degree requirement for graduation. Because you are in your final year ({yearLevel}, with {report.totalCreditHours} credit hours completed out of 132), registering for Practical Training now ensures you fulfill your graduation requirements on schedule.
                            </p>
                            <div className="flex flex-wrap gap-1.5 pt-1 text-[10px]">
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">
                                90+ Cr Gate Met
                              </span>
                              <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-800">
                                Graduation Requirement
                              </span>
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600">
                                0 Credits (Pass/Fail)
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quick-Add: Recommended Retakes (If applicable) */}
        

          {/* SECTION B: Other Eligible Core Courses */}
          {otherEligibleCoreCourses.length > 0 && (
            <RegisterSection
              label="B · Other Eligible Core Courses"
              count={otherEligibleCoreCourses.length}
              labelClassName="text-slate-600"
              divider
            >
              <p className="mb-1 text-[11px] text-slate-400">
                Prerequisites met, but not primary priority this term. Check box to add to schedule:
              </p>
              <ul className="space-y-0.5">
                {otherEligibleCoreCourses.map((course, idx) => {
                  const codeKey = canonicalizeCode(course.code);
                  const isSelected = selectedCodes.has(codeKey);
                  const credits = getCourseCredits(course.code);

                  return (
                    <CourseRow
                      key={idx}
                      code={course.code}
                      title={course.title}
                      credits={credits}
                      tone="slate"
                      selectable
                      selected={isSelected}
                      onToggle={() => toggleCourse(course.code)}
                    />
                  );
                })}
              </ul>
            </RegisterSection>
          )}
          {report.retakeRecommendations.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-50/30 p-2.5">
              <button
                type="button"
                onClick={() => setRetakesExpanded((v) => !v)}
                aria-expanded={retakesExpanded}
                className="flex w-full cursor-pointer items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`shrink-0 text-[10px] text-orange-600 transition-transform ${
                      retakesExpanded ? "rotate-90" : ""
                    }`}
                    aria-hidden
                  >
                    ▶
                  </span>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-orange-900 flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-[10px] text-white font-bold">
                        ↺
                      </span>
                      Recommended Retakes (GPA Boost)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Passed with D+ or lower in the last year. Repeating raises GPA.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {selectedRetakesCount > 0 && (
                    <span className="rounded-full bg-orange-200 px-2 py-0.5 font-mono text-[10px] font-bold text-orange-900">
                      {selectedRetakesCount} selected
                    </span>
                  )}
                  <span className="rounded-full bg-orange-100 px-2 py-0.5 font-mono text-[11px] font-bold text-orange-800">
                    {report.retakeRecommendations.length}
                  </span>
                </div>
              </button>
              <div className={`${retakesExpanded ? "mt-2" : "hidden"} print:block`}>
                <ul className="space-y-1">
                  {report.retakeRecommendations.map((course, idx) => {
                    const codeKey = canonicalizeCode(course.code);
                    const isSelected = selectedCodes.has(codeKey);
                    const credits = getCourseCredits(course.code);

                    return (
                      <CourseRow
                        key={idx}
                        code={course.code}
                        title={course.title}
                        credits={credits}
                        meta={course.semester.label}
                        tag={course.grade}
                        tagTone="orange"
                        badge="Retake Option"
                        badgeTone="orange"
                        tone="orange"
                        selectable
                        selected={isSelected}
                        onToggle={() => toggleCourse(course.code)}
                      />
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {/* SECTION C: Major Electives Pool */}
          {report.availableMajorElectives.length > 0 && (
            <RegisterSection
              label={`C · Full Major Electives Pool (${report.department})`}
              count={report.availableMajorElectives.length}
              labelClassName="text-indigo-600"
              note={
                <>
                  {" "}
                  · <span className="font-semibold">{report.remainingMajorElectives} slot{report.remainingMajorElectives === 1 ? "" : "s"} needed</span>
                </>
              }
              divider
              defaultExpanded={false}
            >
              <p className="mb-1 text-[11px] text-slate-500">
                All eligible major electives for {report.department}:
              </p>
              <ul className="space-y-0.5">
                {report.availableMajorElectives.map((course, idx) => {
                  const codeKey = canonicalizeCode(course.code);
                  const isSelected = selectedCodes.has(codeKey);
                  const credits = getCourseCredits(course.code);

                  return (
                    <CourseRow
                      key={idx}
                      code={course.code}
                      title={course.title}
                      credits={credits}
                      tone="indigo"
                      badge="Major Elective"
                      badgeTone="indigo"
                      selectable
                      selected={isSelected}
                      onToggle={() => toggleCourse(course.code)}
                    />
                  );
                })}
              </ul>
            </RegisterSection>
          )}

          {/* SECTION D: Professional Training Pool */}
          {report.availableProfessionalTraining.length > 0 && (
            <RegisterSection
              label="D · Full Professional Training Pool"
              count={report.availableProfessionalTraining.length}
              labelClassName="text-teal-600"
              note={
                <>
                  {" "}
                  · <span className="font-semibold">{report.remainingProfessionalTraining} slot{report.remainingProfessionalTraining === 1 ? "" : "s"} left</span>
                </>
              }
              divider
              defaultExpanded={false}
            >
              <p className="mb-1 text-[11px] text-slate-500">
                All available professional training options:
              </p>
              <ul className="space-y-0.5">
                {report.availableProfessionalTraining.map((course, idx) => {
                  const codeKey = course.code ? canonicalizeCode(course.code) : course.title;
                  const isSelected = selectedCodes.has(codeKey);
                  const credits = getCourseCredits(course.code);

                  return (
                    <CourseRow
                      key={idx}
                      code={course.code || undefined}
                      title={course.title}
                      credits={credits}
                      tone="teal"
                      badge="Training"
                      badgeTone="teal"
                      selectable
                      selected={isSelected}
                      onToggle={() => toggleCourse(course.code || course.title)}
                    />
                  );
                })}
              </ul>
            </RegisterSection>
          )}

          {/* SECTION E: Science Electives */}
          {report.availableScienceElectives.length > 0 && (
            <RegisterSection
              label="E · Science Electives"
              count={report.availableScienceElectives.length}
              labelClassName="text-cyan-600"
              note={
                <>
                  {" "}
                  · <span className="font-semibold">{report.remainingScienceElectives} slot{report.remainingScienceElectives === 1 ? "" : "s"} left</span>
                </>
              }
              divider
            >
              <ul className="space-y-0.5">
                {report.availableScienceElectives.map((course, idx) => {
                  const codeKey = canonicalizeCode(course.code);
                  const isSelected = selectedCodes.has(codeKey);
                  const credits = getCourseCredits(course.code);

                  return (
                    <CourseRow
                      key={idx}
                      code={course.code}
                      title={course.title}
                      credits={credits}
                      tone="cyan"
                      selectable
                      selected={isSelected}
                      onToggle={() => toggleCourse(course.code)}
                    />
                  );
                })}
              </ul>
            </RegisterSection>
          )}

          {/* SECTION F: University Requirements */}
          {report.availableUniversityRequirements.length > 0 && (
            <RegisterSection
              label="F · University Requirements"
              count={report.availableUniversityRequirements.length}
              labelClassName="text-violet-600"
              note={
                <>
                  {" "}
                  · <span className="font-semibold">{report.remainingUniversityRequirements} slot{report.remainingUniversityRequirements === 1 ? "" : "s"} left</span>
                </>
              }
              divider
            >
              <ul className="space-y-0.5">
                {report.availableUniversityRequirements.map((course, idx) => {
                  const codeKey = canonicalizeCode(course.code);
                  const isSelected = selectedCodes.has(codeKey);
                  const credits = getCourseCredits(course.code);

                  return (
                    <CourseRow
                      key={idx}
                      code={course.code}
                      title={course.title}
                      credits={credits}
                      tone="violet"
                      selectable
                      selected={isSelected}
                      onToggle={() => toggleCourse(course.code)}
                    />
                  );
                })}
              </ul>
            </RegisterSection>
          )}
        </div>
      )}
    </DashCard>
  );
}
