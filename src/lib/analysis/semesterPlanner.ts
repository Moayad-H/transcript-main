/**
 * Semester Planner (manual, advisor-driven)
 *
 * Helps an advisor build a student's future study plan **by hand**, one semester
 * at a time, starting from the courses already completed on the transcript:
 *
 *   - The advisor adds remaining requirements into future semesters and picks a
 *     projected grade for each one.
 *   - The planner evaluates that plan: it advances the projected earned credit
 *     hours and running GPA semester by semester, sizes each semester's credit
 *     cap from the student's academic year and that running GPA, and flags any
 *     course whose prerequisites / credit-hour gate / probation rules aren't
 *     satisfied by the time its semester starts.
 *
 * It is *not* a scheduler — it never places courses itself. It only scores the
 * advisor's choices so the UI can show caps, warnings, and the projected GPA /
 * credit total at graduation. Pure and data-only (no React / React Flow types)
 * so it stays testable and reusable.
 *
 * Per-semester cap rules (identical to the report's registration rules):
 *   - Years 1–2 (< PLANNER_YEAR_UPPER_CREDIT_THRESHOLD earned): normal load 18 Cr.
 *   - Years 3–4 (>= threshold): normal load 15 Cr, may be pushed to 18 Cr.
 *   - Overload: a running projected GPA above PLANNER_OVERLOAD_GPA_THRESHOLD
 *     raises the ceiling to 21 Cr (either year band).
 *   - Probation: a running projected GPA below PROBATION_GPA_THRESHOLD forces the
 *     PROBATION_HALF_LOAD_CREDITS (12 Cr) half-load and blocks Project I.
 * The year band and GPA are recomputed at the *start* of every semester as the
 * plan is walked, so caps move with the projection.
 */

import {
  PLANNER_LOAD_YEARS_1_2,
  PLANNER_LOAD_YEARS_3_4,
  PLANNER_MAX_LOAD_YEARS_3_4,
  PLANNER_OVERLOAD_CREDITS,
  PLANNER_OVERLOAD_GPA_THRESHOLD,
  PLANNER_YEAR_UPPER_CREDIT_THRESHOLD,
  PROBATION_GPA_THRESHOLD,
  PROBATION_HALF_LOAD_CREDITS,
} from "@/lib/constants";

/** A single remaining requirement the advisor can place into a semester. */
export interface PlannerCourse {
  id: string;
  code: string;
  title: string;
  /** Credit hours this course consumes against the per-semester load cap. */
  loadCredit: number;
  /** Credit hours it adds toward earned total / year progression (0 = pass/fail). */
  earnedCredit: number;
  /** Credit hours counted in the GPA (0 = pass/fail training). */
  gpaCredit: number;
  /** Node ids that must be completed in an earlier semester before this one. */
  prereqs: string[];
  /** Credit-hour gate ("N CR" prerequisite), or null when there is none. */
  creditGate: number | null;
  /** Project I is blocked while the projected GPA is on probation. */
  isProjectOne: boolean;
  /** Priority key for candidate ordering — earlier plan semester first. */
  order: number;
}

export type YearBand = "1-2" | "3-4";

/** One course the advisor placed into a future semester. */
export interface PlannedEntry {
  id: string;
  /** Projected letter grade (ignored for pass/fail courses). */
  grade: string;
}

/** A placed course after evaluation, with a validity check against its term. */
export interface EvaluatedEntry {
  id: string;
  grade: string;
  /** True when this course's prereqs / gate / probation rules hold this term. */
  valid: boolean;
  /** Short reason when invalid (unmet prerequisite, credit gate, probation). */
  reason?: string;
}

/** One evaluated future semester. */
export interface EvaluatedTerm {
  /** 1-based future-semester index. */
  index: number;
  yearBand: YearBand;
  /** Soft target load (normal / probation / overload) for the year + GPA. */
  cap: number;
  /** Hard ceiling the semester may be pushed to (before overload it's the cap). */
  ceiling: number;
  /** Total load credits the advisor placed into it. */
  load: number;
  /** Projected earned credit hours entering the semester. */
  earnedAtStart: number;
  /** Running projected GPA entering the semester (null when no GPA basis yet). */
  gpaAtStart: number | null;
  overload: boolean;
  probation: boolean;
  entries: EvaluatedEntry[];
  /** Courses completed before this semester (for eligibility of new picks). */
  completedAtStart: Set<string>;
}

export interface ManualPlannerInput {
  /** All remaining requirements (placed or not). */
  courses: PlannerCourse[];
  /** Node ids already completed or in progress (prerequisites pre-satisfied). */
  completedIds: Set<string>;
  /** Earned credit hours before the first planned semester. */
  startEarnedCredits: number;
  /** Current GPA numerator (grade points) and denominator (GPA credit hours). */
  startGpaPoints: number;
  startGpaCredits: number;
  /** The advisor's future semesters, each a list of placed courses + grades. */
  terms: PlannedEntry[][];
  /** Letter grade -> grade points, for projecting GPA. */
  gradePoints: Record<string, number>;
}

export interface ManualPlannerResult {
  terms: EvaluatedTerm[];
  /** Ids placed into any future semester. */
  placedIds: Set<string>;
  /** Requirements the advisor hasn't placed anywhere yet. */
  unplaced: PlannerCourse[];
  /** Projected GPA once every placed course is graded (null if no basis). */
  finalGpa: number | null;
  /** Earned credit hours once the plan completes. */
  finalEarnedCredits: number;
}

/** Normal load for a year band, before probation/overload adjustments. */
function normalLoadFor(band: YearBand): number {
  return band === "1-2" ? PLANNER_LOAD_YEARS_1_2 : PLANNER_LOAD_YEARS_3_4;
}

/** The manual ceiling a semester may be pushed to (before GPA overload). */
export function hardCapFor(band: YearBand): number {
  // Years 1–2 have no headroom above their normal 18; years 3–4 may reach 18.
  return band === "1-2" ? PLANNER_LOAD_YEARS_1_2 : PLANNER_MAX_LOAD_YEARS_3_4;
}

/** Year band from projected earned credit hours. */
export function yearBandFor(earnedCredits: number): YearBand {
  return earnedCredits < PLANNER_YEAR_UPPER_CREDIT_THRESHOLD ? "1-2" : "3-4";
}

/**
 * The credit cap for a semester, given its year band and the running projected
 * GPA. A `null` GPA (no graded credits yet, e.g. a transfer with no basis) is
 * treated as neither probation nor overload — the plain normal load applies.
 */
export function capFor(
  band: YearBand,
  gpa: number | null
): { cap: number; probation: boolean; overload: boolean } {
  if (gpa !== null && gpa < PROBATION_GPA_THRESHOLD) {
    return { cap: PROBATION_HALF_LOAD_CREDITS, probation: true, overload: false };
  }
  if (gpa !== null && gpa > PLANNER_OVERLOAD_GPA_THRESHOLD) {
    return { cap: PLANNER_OVERLOAD_CREDITS, probation: false, overload: true };
  }
  return { cap: normalLoadFor(band), probation: false, overload: false };
}

/**
 * Evaluate an advisor-built plan. Walks the semesters in order, advancing the
 * projected earned credits and GPA, and checks each placed course against the
 * state at the *start* of its semester. See the module header for the contract.
 */
export function evaluateManualPlan(
  input: ManualPlannerInput
): ManualPlannerResult {
  const {
    courses,
    completedIds,
    startEarnedCredits,
    startGpaPoints,
    startGpaCredits,
    terms,
    gradePoints,
  } = input;

  const byId = new Map(courses.map((c) => [c.id, c]));
  const completed = new Set(completedIds);

  let earned = startEarnedCredits;
  let gpaPoints = startGpaPoints;
  let gpaCredits = startGpaCredits;
  const gpaOf = (): number | null =>
    gpaCredits > 0 ? gpaPoints / gpaCredits : null;

  const placedIds = new Set<string>();
  const evaluatedTerms: EvaluatedTerm[] = [];

  terms.forEach((entries, i) => {
    const earnedAtStart = earned;
    const gpaAtStart = gpaOf();
    const band = yearBandFor(earnedAtStart);
    const { cap, probation, overload } = capFor(band, gpaAtStart);
    const ceiling = probation || overload ? cap : hardCapFor(band);
    // Snapshot of what's finished before this semester — courses placed in the
    // same semester can't satisfy each other's prerequisites.
    const completedAtStart = new Set(completed);

    let load = 0;
    const evaluatedEntries: EvaluatedEntry[] = [];

    for (const entry of entries) {
      const c = byId.get(entry.id);
      if (!c) continue; // stale id (graph rebuilt) — drop silently
      placedIds.add(entry.id);

      let valid = true;
      let reason: string | undefined;
      if (
        gpaAtStart !== null &&
        gpaAtStart < PROBATION_GPA_THRESHOLD &&
        c.isProjectOne
      ) {
        valid = false;
        reason = "Project I is blocked while GPA is under 2.0";
      } else if (c.creditGate !== null && earnedAtStart < c.creditGate) {
        valid = false;
        reason = `Needs ${c.creditGate} Cr. earned first`;
      } else if (!c.prereqs.every((p) => completedAtStart.has(p))) {
        valid = false;
        reason = "A prerequisite isn't completed yet";
      }

      load += c.loadCredit;
      evaluatedEntries.push({ id: entry.id, grade: entry.grade, valid, reason });

      // Commit into the running projection (the advisor's plan is taken as-is,
      // even a flagged course, so downstream semesters reflect their intent).
      completed.add(entry.id);
      earned += c.earnedCredit;
      if (c.gpaCredit > 0) {
        const pts = gradePoints[entry.grade] ?? 0;
        gpaPoints += pts * c.gpaCredit;
        gpaCredits += c.gpaCredit;
      }
    }

    evaluatedTerms.push({
      index: i + 1,
      yearBand: band,
      cap,
      ceiling,
      load,
      earnedAtStart,
      gpaAtStart,
      overload,
      probation,
      entries: evaluatedEntries,
      completedAtStart,
    });
  });

  const unplaced = courses.filter((c) => !placedIds.has(c.id));

  return {
    terms: evaluatedTerms,
    placedIds,
    unplaced,
    finalGpa: gpaOf(),
    finalEarnedCredits: earned,
  };
}

/**
 * The remaining courses eligible to be added to a given semester: prerequisites
 * completed by the term's start, credit-hour gate met by the projected earned
 * credits, and (on probation) Project I excluded. Ordered by plan column then
 * code so the picker reads like the study plan.
 */
export function eligibleForTerm(
  term: EvaluatedTerm,
  unplaced: PlannerCourse[]
): PlannerCourse[] {
  return unplaced
    .filter((c) => {
      if (
        term.gpaAtStart !== null &&
        term.gpaAtStart < PROBATION_GPA_THRESHOLD &&
        c.isProjectOne
      ) {
        return false;
      }
      if (c.creditGate !== null && term.earnedAtStart < c.creditGate) {
        return false;
      }
      return c.prereqs.every((p) => term.completedAtStart.has(p));
    })
    .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
}
