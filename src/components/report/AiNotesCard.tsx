"use client";

import { useEffect, useState } from "react";
import { AnalysisReport } from "@/types";
import { anonymizeReport } from "@/lib/ai/anonymize";
import { generateAdvice } from "@/lib/ai/generateAdvice";
import {
  DAILY_ADVICE_LIMIT,
  getRemainingAdviceCount,
  recordAdviceUse,
} from "@/lib/ai/adviceQuota";
import { DashCard } from "./DashCard";

/**
 * On-demand LLM summary of the already-computed report. Advisory only: the
 * cards around it remain the record, and the report renders in full whether or
 * not this call is ever made or ever succeeds.
 */
export function AiNotesCard({
  report,
  className,
}: {
  report: AnalysisReport;
  className?: string;
}) {
  const [advice, setAdvice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read after mount, not during render: localStorage does not exist during the
  // static export's prerender, and reading it in render would desync hydration.
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => setRemaining(getRemainingAdviceCount()), []);

  const exhausted = remaining !== null && remaining <= 0;

  const handleGenerate = async () => {
    if (exhausted) return;

    setLoading(true);
    setError(null);
    // Counted before the response, so a failure mid-flight cannot be retried
    // for free. The server caps are the real bound; this only paces the UI.
    recordAdviceUse();
    setRemaining(getRemainingAdviceCount());

    try {
      // Only the anonymized payload leaves the browser — no name, no student ID.
      const result = await generateAdvice(anonymizeReport(report));
      if (result.status === "ok") {
        setAdvice(result.advice);
      } else if (result.status === "throttled") {
        setError("Too many requests just now. Wait a minute and try again.");
      } else if (result.status === "daily-limit") {
        setError(result.message);
        setRemaining(0);
      } else {
        setError(result.message);
      }
    } catch (err) {
      console.error("AI notes error:", err);
      setError("Could not generate notes. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashCard
      title="AI Advisor Notes"
      tone="indigo"
      className={className}
      actions={
        advice ? undefined : (
          // In the header, so the one action on this card is never the thing
          // that sits just below the card's scroll fold.
          <div className="flex items-center gap-2 print:hidden">
            {remaining !== null && (
              <span
                className={`text-[11px] ${
                  exhausted ? "font-medium text-red-600" : "text-slate-500"
                }`}
              >
                {exhausted
                  ? "limit reached"
                  : `${remaining}/${DAILY_ADVICE_LIMIT} left`}
              </span>
            )}
            <button
              onClick={handleGenerate}
              disabled={loading || exhausted}
              className="rounded-md bg-indigo-600 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading ? "Generating…" : "Generate"}
            </button>
          </div>
        )
      }
    >
      {/* Stays visible in the printed report too — anyone reading these notes
          on paper needs the same caveat the advisor got. */}
      <p className="mb-2 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800">
        <span className="font-semibold">⚠ Feature under testing.</span> A summary
        of the cards around it, not a substitute for them — always confirm
        against the report before advising.
      </p>

      {advice ? (
        <p className="whitespace-pre-line text-sm text-slate-700">{advice}</p>
      ) : (
        <p className="text-sm italic text-slate-500 print:hidden">
          {exhausted
            ? "Daily limit reached — resets tomorrow."
            : "Generate a short summary of what this student should register and prioritise next semester."}
        </p>
      )}

      {error && (
        <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700 print:hidden">
          {error}
        </p>
      )}
    </DashCard>
  );
}
