"use client";

import React, { useState, useEffect, useCallback } from "react";

interface AdvisorGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  advisorName?: string;
  onDontShowAgain?: (dontShow: boolean) => void;
}

interface StepContent {
  stepNumber: number;
  badge: string;
  title: string;
  subtitle: string;
  highlights: {
    icon: string;
    title: string;
    description: string;
    accent?: string;
  }[];
  tip?: {
    type: "info" | "tip" | "warning";
    text: string;
  };
}

const GUIDE_STEPS: StepContent[] = [
  {
    stepNumber: 1,
    badge: "Introduction",
    title: "Welcome to ERSHAD",
    subtitle:
      "Your intelligent academic advising assistant for the College of Computing and Information Technology (CCIT).",
    highlights: [
      {
        icon: "🔒",
        title: "100% Client-Side Privacy",
        description:
          "All transcripts are parsed and processed locally in your browser. No student records, grades, or personal documents are ever transmitted to any external server.",
        accent: "bg-blue-50 border-blue-200 text-blue-900",
      },
      {
        icon: "🎓",
        title: "Full CCIT Curricula Support",
        description:
          "Supports all departments (CS, SE, IS, CY, AI, GM) and special preparatory tracks (PSCS) with automated prerequisite validation and degree audit tracking.",
        accent: "bg-indigo-50 border-indigo-200 text-indigo-900",
      },
      {
        icon: "⚡",
        title: "From PDF to Action in Seconds",
        description:
          "Instantly converts raw student transcripts into a prioritized upcoming semester schedule, visual prerequisite graph, and degree audit report.",
        accent: "bg-emerald-50 border-emerald-200 text-emerald-900",
      },
    ],
    tip: {
      type: "info",
      text: "You can reopen this guide at any time by clicking the '📖 Guide' button in the top navigation bar.",
    },
  },
  {
    stepNumber: 2,
    badge: "Step 1 · Input",
    title: "Uploading Transcripts",
    subtitle:
      "Easily advise individual students or process an entire cohort simultaneously.",
    highlights: [
      {
        icon: "📄",
        title: "Single Student Advising",
        description:
          "Drag & drop any official CCIT PDF transcript. ERSHAD automatically extracts the Student ID, Name, Department, CGPA, Completed Credits, and Remedial course status.",
        accent: "bg-sky-50 border-sky-200 text-sky-900",
      },
      {
        icon: "📁",
        title: "Batch Cohort Advising",
        description:
          "Switch to Batch Mode to upload a .ZIP archive or select multiple PDF transcripts at once. Quickly compute cohort averages, identify probation risks, and generate printable sheets.",
        accent: "bg-purple-50 border-purple-200 text-purple-900",
      },
      {
        icon: "🔄",
        title: "Dynamic Plan Switching",
        description:
          "If a student changed majors or you want to evaluate an alternate plan (e.g. CS vs AI), change their department anytime from the top bar selector without re-uploading.",
        accent: "bg-amber-50 border-amber-200 text-amber-900",
      },
    ],
    tip: {
      type: "tip",
      text: "If a student transcript is unavailable, you can use the 'Manual Entry' option to test custom course combinations.",
    },
  },
  {
    stepNumber: 3,
    badge: "Step 2 · Action Hub",
    title: "Smart Registration Hub",
    subtitle:
      "A prioritized registration plan tailored to the student's exact academic standing.",
    highlights: [
      {
        icon: "⭐",
        title: "Section A: Recommended Schedule",
        description:
          "Pre-selects top priority courses that unlock downstream prerequisite chains (Tier 1), core subjects (Tier 2), major electives, and professional training.",
        accent: "bg-blue-50 border-blue-200 text-blue-900",
      },
      {
        icon: "💡",
        title: "'Why?' Badges & Rationale",
        description:
          "Click the 'Why?' badge on any recommended course to view its exact study plan semester, priority tier, and the full list of future courses it unlocks.",
        accent: "bg-amber-50 border-amber-200 text-amber-900",
      },
      {
        icon: "🛒",
        title: "Live Registration Basket",
        description:
          "Toggle checkboxes to build a custom semester schedule. The real-time credit meter warns you if you exceed probation limits (12 Cr), normal load (15–18 Cr), or overload caps (21 Cr).",
        accent: "bg-emerald-50 border-emerald-200 text-emerald-900",
      },
    ],
    tip: {
      type: "info",
      text: "Lower-priority courses with 0 dependents (like CNC1401) are placed in Section B so they don't crowd out critical prerequisite chains.",
    },
  },
  {
    stepNumber: 4,
    badge: "Step 3 · Audit",
    title: "Academic Health & Degree Audit",
    subtitle:
      "Instant diagnostics and safety gates to keep students on track toward graduation.",
    highlights: [
      {
        icon: "🚨",
        title: "Academic Probation Warnings",
        description:
          "Students with GPA < 2.0 are highlighted with probation alerts and automatically constrained to a 12-credit half-load cap. Project I is blocked until GPA recovery.",
        accent: "bg-red-50 border-red-200 text-red-900",
      },
      {
        icon: "🚧",
        title: "Remedial Precedence Gates",
        description:
          "Calculus I is gated until Precalculus (EBA0201) is passed. Academic English is gated until Remedial English (GLA0001) is cleared.",
        accent: "bg-orange-50 border-orange-200 text-orange-900",
      },
      {
        icon: "📊",
        title: "Degree Requirements Meters",
        description:
          "Track progress across Major Electives, Science Electives, University Requirements, Professional Training, and Practical Training (CIT4000) at a glance.",
        accent: "bg-indigo-50 border-indigo-200 text-indigo-900",
      },
    ],
    tip: {
      type: "warning",
      text: "Graduation requires 132 earned credit hours, clearing all category requirements, completing Practical Training, and maintaining a GPA ≥ 2.0.",
    },
  },
  {
    stepNumber: 5,
    badge: "Step 4 · Simulation",
    title: "Prerequisite Graph & 'What-If'",
    subtitle:
      "Visualize the entire 8-semester curriculum DAG and simulate future semesters.",
    highlights: [
      {
        icon: "🗺️",
        title: "Interactive Course DAG",
        description:
          "Switch to 'Course Graph' view to see all 8 semesters laid out. Nodes are color-coded: Green (Passed with grade), Blue (In-Progress / U), Emerald (Available), and Gray (Locked).",
        accent: "bg-teal-50 border-teal-200 text-teal-900",
      },
      {
        icon: "🔮",
        title: "What-If Planning Mode",
        description:
          "Click course nodes to simulate taking them. Instantly see how passing a course unlocks downstream prerequisites and affects credit hours and projected graduation term.",
        accent: "bg-purple-50 border-purple-200 text-purple-900",
      },
      {
        icon: "🎛️",
        title: "Smart Layout Controls",
        description:
          "Filter by specific semesters, zoom in/out, pan across departments, and inspect course prerequisites and unlocked children with one click.",
        accent: "bg-blue-50 border-blue-200 text-blue-900",
      },
    ],
    tip: {
      type: "tip",
      text: "Use the Course Graph when advising students who have complex irregular schedules or need to recover from prerequisite bottlenecks.",
    },
  },
  {
    stepNumber: 6,
    badge: "Step 5 · Output",
    title: "Printing & Cohort Reporting",
    subtitle:
      "Generate clean physical records and reports for students and department archives.",
    highlights: [
      {
        icon: "🖨️",
        title: "1-Click Clean Print",
        description:
          "Click 'Print' in the student bar to generate a clean, landscape-optimized advising report with all cards expanded and zero screen clutter.",
        accent: "bg-slate-50 border-slate-200 text-slate-900",
      },
      {
        icon: "📑",
        title: "Cohort Printable Sheets",
        description:
          "In Batch Mode, use 'Print All Students' to output individual standardized 1-page curriculum matrix sheets for an entire advising section in one print job.",
        accent: "bg-indigo-50 border-indigo-200 text-indigo-900",
      },
      {
        icon: "💾",
        title: "Download Text Advisories",
        description:
          "Download student advising summaries as formatted text files to email directly to students or paste into advising logs.",
        accent: "bg-emerald-50 border-emerald-200 text-emerald-900",
      },
    ],
    tip: {
      type: "info",
      text: "You're all set! Upload a transcript or batch archive to begin advising your students.",
    },
  },
];

export function AdvisorGuideModal({
  isOpen,
  onClose,
  advisorName,
  onDontShowAgain,
}: AdvisorGuideModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        if (currentStep < GUIDE_STEPS.length - 1) {
          setCurrentStep((prev) => prev + 1);
        }
      } else if (e.key === "ArrowLeft") {
        if (currentStep > 0) {
          setCurrentStep((prev) => prev - 1);
        }
      }
    },
    [isOpen, currentStep, onClose]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const step = GUIDE_STEPS[currentStep];
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === GUIDE_STEPS.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      handleFinish();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (!isFirstStep) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleFinish = () => {
    if (onDontShowAgain) {
      onDontShowAgain(dontShowAgain);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guide-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
    >
      {/* Modal Card */}
      <div className="flex flex-col w-full max-w-4xl max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200/80">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-brand text-white border-b border-blue-900/40 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-xl font-bold border border-white/20">
              📖
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="guide-modal-title" className="text-lg font-bold leading-tight tracking-tight">
                  ERSHAD Advisor Guide
                </h2>
                <span className="rounded bg-blue-400/20 px-2 py-0.5 text-xs font-semibold text-blue-200 border border-blue-300/30">
                  {advisorName ? `Welcome, ${advisorName}` : "Advisor Quickstart"}
                </span>
              </div>
              <p className="text-xs text-blue-200 mt-0.5">
                Overview &amp; Workflow Guide for CCIT Academic Advisors
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline-block text-xs font-medium text-blue-200">
              Step {currentStep + 1} of {GUIDE_STEPS.length}
            </span>
            <button
              type="button"
              onClick={handleFinish}
              className="rounded-lg p-1.5 text-blue-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close guide"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Step Indicator Bar / Stepper Tabs */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-2.5 flex items-center justify-between gap-1 sm:gap-2 overflow-x-auto shrink-0">
          {GUIDE_STEPS.map((s, idx) => {
            const isActive = idx === currentStep;
            const isCompleted = idx < currentStep;
            return (
              <button
                key={s.stepNumber}
                type="button"
                onClick={() => setCurrentStep(idx)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? "bg-brand text-white shadow-xs"
                    : isCompleted
                    ? "bg-blue-100/80 text-blue-900 hover:bg-blue-200/80"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-200/60"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${
                    isActive
                      ? "bg-white text-brand font-bold"
                      : isCompleted
                      ? "bg-blue-800 text-white"
                      : "bg-slate-300 text-slate-700"
                  }`}
                >
                  {isCompleted ? "✓" : s.stepNumber}
                </span>
                <span className="hidden md:inline">{s.badge.replace(/Step \d · /, "")}</span>
              </button>
            );
          })}
        </div>

        {/* Step Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          {/* Step Header */}
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 border border-blue-200">
              {step.badge}
            </div>
            <h3 className="text-2xl font-bold text-slate-900 tracking-tight">
              {step.title}
            </h3>
            <p className="text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
              {step.subtitle}
            </p>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {step.highlights.map((h, index) => (
              <div
                key={index}
                className={`p-4 rounded-xl border transition-all ${
                  h.accent || "bg-slate-50 border-slate-200 text-slate-900"
                }`}
              >
                <div className="text-2xl mb-2.5">{h.icon}</div>
                <h4 className="font-bold text-sm text-slate-900 mb-1.5">
                  {h.title}
                </h4>
                <p className="text-xs text-slate-700 leading-relaxed">
                  {h.description}
                </p>
              </div>
            ))}
          </div>

          {/* Tip Callout */}
          {step.tip && (
            <div
              className={`flex items-start gap-3 p-3.5 rounded-xl border text-xs leading-relaxed ${
                step.tip.type === "warning"
                  ? "bg-amber-50 border-amber-200 text-amber-900"
                  : step.tip.type === "tip"
                  ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                  : "bg-blue-50 border-blue-200 text-blue-900"
              }`}
            >
              <span className="text-base shrink-0">
                {step.tip.type === "warning" ? "⚠️" : step.tip.type === "tip" ? "💡" : "ℹ️"}
              </span>
              <div className="flex-1">
                <span className="font-bold">
                  {step.tip.type === "warning" ? "Notice: " : step.tip.type === "tip" ? "Pro Tip: " : "Note: "}
                </span>
                {step.tip.text}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Controls */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 bg-slate-50 border-t border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand cursor-pointer"
              />
              <span>Don&apos;t show this guide on startup</span>
            </label>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleFinish}
              className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              Skip
            </button>

            {!isFirstStep && (
              <button
                type="button"
                onClick={handlePrev}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ← Previous
              </button>
            )}

            <button
              type="button"
              onClick={handleNext}
              className="px-5 py-2 rounded-lg bg-brand text-white text-xs font-bold hover:bg-blue-900 transition-all shadow-sm hover:shadow cursor-pointer flex items-center gap-1.5"
            >
              <span>{isLastStep ? "Get Started" : "Next"}</span>
              {!isLastStep && <span>→</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
