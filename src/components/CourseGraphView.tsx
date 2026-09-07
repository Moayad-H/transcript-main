"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnalysisReport, TranscriptData, Department, Semester } from "@/types";
import {
  canonicalizeCode,
  isTwoCreditCourse,
  DEPARTMENTS,
  DEPARTMENT_NAMES,
  PROBATION_HALF_LOAD_CREDITS,
  PRACTICAL_TRAINING_CODE,
  GRADUATION_CREDIT_HOURS,
  isProjectOneTitle,
  GRADES,
  PROBATION_GPA_THRESHOLD,
  PLANNER_OVERLOAD_GPA_THRESHOLD,
  PLANNER_SUMMER_NORMAL_LOAD,
  PLANNER_SUMMER_MAX_LOAD,
  SPECIAL_COURSES,
} from "@/lib/constants";
import {
  buildCourseGraph,
  CourseStatus,
  GraphCourseNode,
} from "@/lib/analysis/courseGraphBuilder";
import {
  evaluateManualPlan,
  eligibleForTerm,
  PlannerCourse,
  PlannedEntry,
  PlannedTermInput,
} from "@/lib/analysis/semesterPlanner";
import {
  compareSemesters,
  semesterIndex,
  nextPlanningSemester,
  getSummerSemester,
} from "@/lib/analysis/semester";
import { generateReport } from "@/lib/analysis/reportGenerator";
import { createPortal } from "react-dom";
import { logAdvisorAction } from "@/lib/logging/auditLogger";
import { PrintableSemesterPlan } from "@/components/planner/PrintableSemesterPlan";

// Canonical practical-training code, precomputed for the planner's pass/fail check.
const PRACTICAL_TRAINING_CANON = canonicalizeCode(PRACTICAL_TRAINING_CODE);

// GPA grade points (per the CCIT scale). U/W/I/F carry 0 points.
const GRADE_POINTS: Record<string, number> = {
  "A+": 4.0,
  "A": 3.7,
  "A-": 3.4,
  "B+": 3.2,
  "B": 3.0,
  "B-": 2.8,
  "C+": 2.6,
  "C": 2.4,
  "C-": 2.2,
  "D+": 2.0,
  "D": 1.5,
  "D-": 1.0,
  "F": 0,
  "U": 0,
  "W": 0,
  "I": 0,
};

// Letter grades a student can project onto a not-yet-graded course. All of
// these count toward the GPA (numerator and denominator).
const PROJECTABLE_GRADES = [
  "A+",
  "A",
  "A-",
  "B+",
  "B",
  "B-",
  "C+",
  "C",
  "C-",
  "D+",
  "D",
  "D-",
  "F",
];

// Transcript grades that count toward the *current* GPA. Excludes W/U/I (not a
// completed grade) and P/Tr (pass/transfer — no grade points).
const GPA_COUNTED_GRADES = new Set(PROJECTABLE_GRADES);

// Grades that earn credit hours (used to total a past semester's earned Cr).
const PASSING_GRADES = new Set<string>([...GRADES.PASSING]);

// Registered / not-yet-graded grade(s) — mark a semester as still in progress.
const UNGRADED_GRADES = new Set<string>([...GRADES.UNGRADED]);

// Grade a newly-placed course starts on in the semester planner.
const DEFAULT_PLAN_GRADE = "B";

/** Credit-hour value of a course code (0 for Practical Training CIT4000 & remedial courses, 2 for UNR/CNC1401, else 3). */
function creditValueForCode(code: string): number {
  const canon = canonicalizeCode(code);
  if (
    canon === PRACTICAL_TRAINING_CANON ||
    canon === canonicalizeCode(SPECIAL_COURSES.REMEDIAL_ENGLISH) ||
    canon === canonicalizeCode(SPECIAL_COURSES.PRECALCULUS)
  ) {
    return 0;
  }
  return isTwoCreditCourse(canon) ? 2 : 3;
}

interface CourseGraphViewProps {
  report: AnalysisReport;
  transcriptData: TranscriptData;
}

// Manual override a user can set on a course in planning mode.
// "completed" => finished, "ungraded" => registered/in-progress,
// "none" => explicitly mark as not taken (clears a parsed status).
type Override = "completed" | "ungraded" | "none";

// Click-cycle order for manual mode: Auto -> Finished -> Registered -> Not taken -> Auto.
const OVERRIDE_CYCLE: (Override | undefined)[] = [
  undefined,
  "ungraded",
  "completed",
  "none",
];

const OVERRIDE_LABEL: Record<Override, string> = {
  completed: "Finished",
  ungraded: "Registered",
  none: "Not taken",
};

// Status -> presentation. Colors mirror the ReportSection badge palette.
const STATUS_STYLES: Record<
  CourseStatus,
  { card: string; label: string; mini: string }
> = {
  completed: {
    card: "bg-green-50 border-green-500 text-green-900",
    label: "Completed",
    mini: "#22c55e",
  },
  available: {
    card: "bg-blue-50 border-blue-500 text-blue-900",
    label: "Available to register",
    mini: "#3b82f6",
  },
  ungraded: {
    card: "bg-yellow-50 border-yellow-500 text-yellow-900",
    label: "In progress (ungraded)",
    mini: "#eab308",
  },
  failed: {
    card: "bg-red-50 border-red-500 text-red-900",
    label: "Withdrawn / failed",
    mini: "#ef4444",
  },
  blocked: {
    card: "bg-gray-50 border-gray-300 text-gray-500",
    label: "Blocked (prereqs unmet)",
    mini: "#9ca3af",
  },
  elective: {
    card: "bg-purple-50 border-purple-400 text-purple-900",
    label: "Elective slot",
    mini: "#a855f7",
  },
};

type CourseNodeData = Pick<
  GraphCourseNode,
  "code" | "title" | "status" | "grade" | "isElectiveSlot" | "creditReq"
> & {
  // Set when a node is selected: this node is either the selection, a
  // prerequisite of it, a course that depends on it, or dimmed (unrelated).
  emphasis?: "selected" | "prereq" | "dependent" | null;
  dim?: boolean;
  // Manual planning mode: whether it's active, and the user's override (if any).
  manualMode?: boolean;
  override?: Override | null;
  // Semester-planner mode: how this course relates to the active target term, and
  // the +/- affordance that adds it to / removes it from that term.
  plannerGlow?: "eligible" | "placed" | "placed-other" | null;
  plannerAffordance?: "add" | "remove" | null;
  onPlannerToggle?: () => void;
};

function CourseNode({ data }: NodeProps<Node<CourseNodeData>>) {
  const styles = STATUS_STYLES[data.status];
  // Planner rings take priority while planning; otherwise selection / override.
  const ring =
    data.plannerGlow === "eligible"
      ? "ring-2 ring-offset-1 ring-green-500"
      : data.plannerGlow === "placed"
      ? "ring-2 ring-offset-1 ring-indigo-500"
      : data.emphasis === "selected"
      ? "ring-2 ring-offset-1 ring-blue-600"
      : data.emphasis === "prereq"
      ? "ring-2 ring-offset-1 ring-amber-500"
      : data.emphasis === "dependent"
      ? "ring-2 ring-offset-1 ring-teal-500"
      : data.override
      ? "ring-2 ring-offset-1 ring-indigo-500"
      : "";
  return (
    <div
      className={`relative w-56 rounded-lg border-2 shadow-sm px-3 py-2 transition-opacity ${
        styles.card
      } ${data.isElectiveSlot ? "border-dashed" : ""} ${ring} ${
        data.dim ? "opacity-25" : "opacity-100"
      } ${data.manualMode ? "cursor-pointer" : ""}`}
    >
      {data.plannerAffordance && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            data.onPlannerToggle?.();
          }}
          title={
            data.plannerAffordance === "add"
              ? "Add to the active semester"
              : "Remove from the active semester"
          }
          className={`nodrag absolute -top-2 -right-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold text-white shadow-md ${
            data.plannerAffordance === "add"
              ? "bg-green-600 hover:bg-green-700"
              : "bg-indigo-600 hover:bg-indigo-700"
          }`}
        >
          {data.plannerAffordance === "add" ? "＋" : "−"}
        </button>
      )}
      {data.plannerGlow === "placed-other" && (
        <span className="absolute -top-2 -right-2 z-10 rounded-full bg-indigo-400 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white shadow">
          Planned
        </span>
      )}
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold bg-white/60 px-1.5 py-0.5 rounded">
          {data.code}
        </span>
        {/* Earned grade, shown only while the card still reflects the real
            transcript status (a manual override can flip it to hypothetical). */}
        {data.grade &&
          (data.status === "completed" || data.status === "failed") && (
            <span
              className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                data.status === "failed"
                  ? "bg-red-600 text-white"
                  : "bg-green-600 text-white"
              }`}
              title={`Grade: ${data.grade}`}
            >
              {data.grade}
            </span>
          )}
        {data.creditReq && (
          <span className="text-[10px] font-bold uppercase bg-white/70 px-1.5 py-0.5 rounded">
            {data.creditReq}
          </span>
        )}
      </div>
      <p className="mt-1 text-xs leading-snug line-clamp-2">{data.title}</p>
      {data.override && (
        <span className="mt-1 inline-block text-[10px] font-semibold uppercase tracking-wide bg-indigo-600 text-white px-1.5 py-0.5 rounded">
          Manual: {OVERRIDE_LABEL[data.override]}
        </span>
      )}
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
    </div>
  );
}

/** Non-interactive column header rendered above each semester's column. */
function TermHeaderNode({ data }: NodeProps<Node<{ label: string }>>) {
  return (
    <div className="w-56 text-center select-none pointer-events-none">
      <span className="inline-block text-lg font-bold uppercase tracking-wide text-gray-800 bg-white/80 border border-gray-400 rounded px-15 py-3 shadow-sm">
        {data.label}
      </span>
    </div>
  );
}

const nodeTypes = { course: CourseNode, term: TermHeaderNode };

const LEGEND: CourseStatus[] = [
  "completed",
  "available",
  "ungraded",
  "blocked",
  "failed",
  "elective",
];

export default function CourseGraphView({
  report: initialReport,
  transcriptData,
}: CourseGraphViewProps) {
  // The department currently viewed. Defaults to the transcript's detected
  // department but can be switched to see the same transcript against another
  // department's plan.
  const [activeDept, setActiveDept] = useState<Department>(
    initialReport.department as Department
  );
  // The report driving the graph. For the detected department this is the
  // report passed in; for any other department it's regenerated on the fly
  // from the same transcript.
  const [report, setReport] = useState<AnalysisReport>(initialReport);
  const [deptLoading, setDeptLoading] = useState(false);

  const [graph, setGraph] = useState<{ nodes: Node[]; edges: Edge[] } | null>(
    null
  );
  // Non-interactive semester column headers ("Term 1", "Term 2", …).
  const [termNodes, setTermNodes] = useState<Node[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Currently selected course node (click to highlight its prerequisites).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Manual planning mode: click courses to override their status.
  const [manualMode, setManualMode] = useState(false);
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  // GPA calculator: assign hypothetical grades to registered courses.
  const [gpaMode, setGpaMode] = useState(false);
  const [projGrades, setProjGrades] = useState<Map<string, string>>(new Map());
  // Semester planner: the advisor builds future semesters by hand, one at a
  // time, on top of the completed transcript. Each future semester is a list of
  // placed courses with a projected grade; the planner scores them (caps, GPA).
  const [plannerMode, setPlannerMode] = useState(false);
  const [plannerTerms, setPlannerTerms] = useState<PlannedTermInput[]>([]);
  // The future term the graph is currently helping fill: its eligible courses
  // glow and expose a "+" affordance in the graph. Null = none targeted.
  const [activePlannerTerm, setActivePlannerTerm] = useState<number | null>(null);
  // Whether the vertical planner sheet is collapsed to maximize graph area.
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);
  // Whether completed semesters accordion is expanded in the vertical sheet.
  const [showCompletedTerms, setShowCompletedTerms] = useState(false);
  // Transient message shown when a manual action is blocked by the probation
  // half-load cap.
  const [capWarning, setCapWarning] = useState<string | null>(null);
  // Controls the official semester study plan print preview modal.
  const [showPrintModal, setShowPrintModal] = useState(false);
  // Transient toast when a previously saved plan is restored for this student.
  const [planSavedNotice, setPlanSavedNotice] = useState<string | null>(null);

  // Storage key for auto-persisting the student's graduation plan
  const planStorageKey = report.studentID ? `ershad_plan_${report.studentID}` : null;

  // Hydrate saved plan on mount / when report.studentID changes
  useEffect(() => {
    if (!planStorageKey) return;
    try {
      const raw = window.localStorage.getItem(planStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed.terms) && parsed.terms.length > 0) {
          setPlannerTerms(parsed.terms);
          if (Array.isArray(parsed.projGrades)) {
            setProjGrades(new Map(parsed.projGrades));
          }
          setPlanSavedNotice("Restored saved plan");
          const timer = setTimeout(() => setPlanSavedNotice(null), 4000);
          return () => clearTimeout(timer);
        }
      }
    } catch {
      // Ignore localStorage read errors
    }
  }, [planStorageKey]);

  // Auto-save plan when plannerTerms or projGrades change
  useEffect(() => {
    if (!planStorageKey) return;
    try {
      if (plannerTerms.length > 0) {
        window.localStorage.setItem(
          planStorageKey,
          JSON.stringify({
            terms: plannerTerms,
            projGrades: Array.from(projGrades.entries()),
            savedAt: new Date().toISOString(),
          })
        );
      }
    } catch {
      // Ignore localStorage write errors
    }
  }, [planStorageKey, plannerTerms, projGrades]);

  // Whether the student is on academic probation (half-load): registration is
  // capped at 12 Cr and Project I is blocked until the GPA reaches 2.0. Uses the
  // report's official probation flag (derived from the transcript's GPA).
  const onProbation = report.onProbation;

  // A fresh transcript (new upload) resets the viewed department and report
  // back to the detected one.
  useEffect(() => {
    setActiveDept(initialReport.department as Department);
    setReport(initialReport);
  }, [initialReport]);

  // Guards against a stale regenerated report landing after the user has
  // switched departments again.
  const deptRequestRef = useRef(0);

  // Switch the viewed department: reuse the passed report for the detected
  // department, otherwise regenerate it from the same transcript.
  const handleDeptChange = useCallback(
    (dept: Department) => {
      const token = ++deptRequestRef.current;
      setActiveDept(dept);
      if (dept === initialReport.department) {
        setDeptLoading(false);
        setReport(initialReport);
        return;
      }
      setDeptLoading(true);
      generateReport(initialReport.studentID,initialReport.studentName, dept, transcriptData)
        .then((r) => {
          if (deptRequestRef.current !== token) return; // superseded
          setReport(r);
          setDeptLoading(false);
        })
        .catch(() => {
          if (deptRequestRef.current === token) setDeptLoading(false);
        });
    },
    [initialReport, transcriptData]
  );

  useEffect(() => {
    let cancelled = false;

    buildCourseGraph(
      report.department as Department,
      transcriptData,
      report
    )
      .then((result) => {
        if (cancelled) return;
        const nodes: Node[] = result.nodes.map((n) => ({
          id: n.id,
          type: "course",
          position: n.position,
          data: {
            code: n.code,
            title: n.title,
            status: n.status,
            grade: n.grade,
            isElectiveSlot: n.isElectiveSlot,
            creditReq: n.creditReq,
          },
        }));
        const edges: Edge[] = result.edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          markerEnd: { type: MarkerType.ArrowClosed },
          style: { stroke: "#94a3b8" },
        }));
        // Column headers sit just above the top row of course cards.
        const headers: Node[] = result.columns.map((c) => ({
          id: `term-${c.x}`,
          type: "term",
          position: { x: c.x, y: -72 },
          data: { label: c.label },
          draggable: false,
          selectable: false,
        }));
        setGraph({ nodes, edges });
        setTermNodes(headers);
        setSelectedId(null);
        // A fresh transcript invalidates any manual planning overrides,
        // projected grades, and semester-plan pins.
        setOverrides(new Map());
        setProjGrades(new Map());
        setPlannerTerms([]);
        setActivePlannerTerm(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to build course graph"
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [report, transcriptData]);

  const miniMapColor = useMemo(
    () => (node: Node) =>
      node.type === "term"
        ? "#989A9C"
        : STATUS_STYLES[(node.data as CourseNodeData).status]?.mini ?? "#9ca3af",
    []
  );

  // target node id -> its direct prerequisite (source) node ids.
  const prereqsByTarget = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!graph) return map;
    for (const e of graph.edges) {
      const list = map.get(e.target) ?? [];
      list.push(e.source);
      map.set(e.target, list);
    }
    return map;
  }, [graph]);

  // source node id -> the courses that list it as a prerequisite (target ids).
  const dependentsBySource = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!graph) return map;
    for (const e of graph.edges) {
      const list = map.get(e.source) ?? [];
      list.push(e.target);
      map.set(e.source, list);
    }
    return map;
  }, [graph]);

  // Effective status per node, applying manual overrides and recomputing
  // downstream availability from prerequisites AND credit-hour gates. Also
  // returns the running achieved credit-hour total. This is what gets rendered.
  const { statuses: effectiveStatus, achievedCreditHours } = useMemo(() => {
    const statuses = new Map<string, CourseStatus>();
    if (!graph)
      return { statuses, achievedCreditHours: report.totalCreditHours };

    const originalStatus = (n: Node) => (n.data as CourseNodeData).status;

    // First pass: which courses count as completed (parsed or manually marked).
    const completedSet = new Set<string>();
    for (const n of graph.nodes) {
      const ov = overrides.get(n.id);
      const done =
        ov === "completed" ||
        (ov === undefined && originalStatus(n) === "completed");
      if (done) completedSet.add(n.id);
    }

    // Achieved credit hours = the parsed baseline, adjusted by manual overrides
    // that add or remove a completed course. This feeds the credit-hour gates.
    let achieved = report.totalCreditHours;
    for (const n of graph.nodes) {
      const ov = overrides.get(n.id);
      if (ov === undefined) continue;
      const wasCompleted = originalStatus(n) === "completed";
      const nowCompleted = ov === "completed";
      const cv = creditValueForCode((n.data as CourseNodeData).code);
      if (nowCompleted && !wasCompleted) achieved += cv;
      else if (!nowCompleted && wasCompleted) achieved -= cv;
    }

    // Recompute available/blocked for a not-yet-taken course from its prereqs,
    // or — for a credit-hour gate — from the running achieved credit total.
    const recompute = (n: Node): CourseStatus => {
      // A student on probation cannot register Project I, regardless of prereqs
      // or achieved credit hours, until their GPA recovers to 2.0.
      if (onProbation && isProjectOneTitle((n.data as CourseNodeData).title)) {
        return "blocked";
      }
      const creditReq = (n.data as CourseNodeData).creditReq;
      if (creditReq) {
        const m = creditReq.match(/(\d+)/);
        const need = m ? parseInt(m[1], 10) : 0;
        return achieved >= need ? "available" : "blocked";
      }
      const prereqs = prereqsByTarget.get(n.id) ?? [];
      if (prereqs.length === 0) return "available";
      return prereqs.every((p) => completedSet.has(p)) ? "available" : "blocked";
    };

    for (const n of graph.nodes) {
      const ov = overrides.get(n.id);
      let s: CourseStatus;
      if (ov === "completed") s = "completed";
      else if (ov === "ungraded") s = "ungraded";
      else if (ov === "none") s = recompute(n);
      else {
        // No override: keep terminal statuses, recompute the open/blocked ones.
        const orig = originalStatus(n);
        s = orig === "available" || orig === "blocked" ? recompute(n) : orig;
      }
      statuses.set(n.id, s);
    }
    return { statuses, achievedCreditHours: achieved };
  }, [graph, overrides, prereqsByTarget, report.totalCreditHours, onProbation]);

  // Current GPA from the parsed transcript: achieved points / GPA credit hours.
  // Repeated courses count only once — the registrar keeps the best attempt
  // (highest grade points), so a failed course that was later retaken and
  // passed must not drag the GPA down. Without this dedup, every failing
  // retake is summed in and the computed GPA falls well below the official one.
  const currentGpa = useMemo(() => {
    const best = new Map<string, string>(); // canonical code -> best grade
    for (const c of transcriptData.courses) {
      if (!GPA_COUNTED_GRADES.has(c.grade)) continue;
      const key = canonicalizeCode(c.code);
      const prev = best.get(key);
      if (prev === undefined || GRADE_POINTS[c.grade] > GRADE_POINTS[prev]) {
        best.set(key, c.grade);
      }
    }
    let points = 0;
    let ch = 0;
    for (const [code, grade] of best) {
      const cv = creditValueForCode(code);
      points += GRADE_POINTS[grade] * cv;
      ch += cv;
    }
    return { points, ch, gpa: ch > 0 ? points / ch : 0 };
  }, [transcriptData]);

  // Courses currently "registered" (ungraded) — the ones you can project a
  // future grade onto.
  const registeredNodes = useMemo<Node[]>(() => {
    if (!graph) return [];
    return graph.nodes.filter((n) => effectiveStatus.get(n.id) === "ungraded");
  }, [graph, effectiveStatus]);

  // Total credit hours currently marked as registered (ungraded). Drives the
  // probation half-load (12 Cr) cap.
  const registeredCredits = useMemo(
    () =>
      registeredNodes.reduce(
        (sum, n) => sum + creditValueForCode((n.data as CourseNodeData).code),
        0
      ),
    [registeredNodes]
  );

  // Projected GPA = current GPA plus the hypothetical grades assigned to
  // registered courses.
  const projectedGpa = useMemo(() => {
    let points = currentGpa.points;
    let ch = currentGpa.ch;
    let count = 0;
    if (graph) {
      const byId = new Map(graph.nodes.map((n) => [n.id, n]));
      for (const [id, grade] of projGrades) {
        const n = byId.get(id);
        // Only count a grade that's still on a registered course.
        if (!n || effectiveStatus.get(id) !== "ungraded") continue;
        if (!(grade in GRADE_POINTS)) continue;
        const cv = creditValueForCode((n.data as CourseNodeData).code);
        points += GRADE_POINTS[grade] * cv;
        ch += cv;
        count += 1;
      }
    }
    return { gpa: ch > 0 ? points / ch : 0, ch, count };
  }, [currentGpa, graph, projGrades, effectiveStatus]);

  // Semester planner: the remaining requirements (everything not completed and
  // not currently in progress), shaped for the term-by-term scheduler. Each
  // course carries its load credits, its earned/GPA credits (0 for pass/fail
  // training), any credit-hour gate, and its plan-column order for priority.
  const { plannerCourses, plannerCompletedIds } = useMemo(() => {
    const plannerCourses: PlannerCourse[] = [];
    const plannerCompletedIds = new Set<string>();
    if (!graph) return { plannerCourses, plannerCompletedIds };

    for (const n of graph.nodes) {
      const d = n.data as CourseNodeData;
      const status = effectiveStatus.get(n.id) ?? d.status;
      // Completed and in-progress courses pre-satisfy prerequisites; everything
      // else (available/blocked/failed/empty elective slot) needs scheduling.
      if (status === "completed" || status === "ungraded") {
        plannerCompletedIds.add(n.id);
        continue;
      }

      // Elective slots carry their category in the node id (elective-CATEGORY-i).
      const category = n.id.startsWith("elective-")
        ? n.id.split("-")[1]
        : null;
      const cv =
        category === "UNIVERSITY"
          ? 2
          : d.isElectiveSlot
          ? 3
          : creditValueForCode(d.code);
      // Professional Training slots and Practical Training are pass/fail (0 Cr):
      // they add nothing toward earned credits or GPA, and carry 0 load credits.
      const isProfessional = category === "PROFESSIONAL";
      const isPractical = canonicalizeCode(d.code) === PRACTICAL_TRAINING_CANON;
      const isTraining = isProfessional || isPractical;
      const gateMatch = d.creditReq?.match(/(\d+)/);
      const creditGate = gateMatch ? parseInt(gateMatch[1], 10) : null;

      plannerCourses.push({
        id: n.id,
        code: d.code || "Elective",
        title: d.title,
        loadCredit: isTraining ? 0 : cv,
        earnedCredit: isTraining ? 0 : cv,
        gpaCredit: isTraining ? 0 : cv,
        prereqs: prereqsByTarget.get(n.id) ?? [],
        creditGate,
        isProjectOne: isProjectOneTitle(d.title),
        order: n.position.x,
      });
    }
    return { plannerCourses, plannerCompletedIds };
  }, [graph, effectiveStatus, prereqsByTarget]);

  const plannerCourseById = useMemo(
    () => new Map(plannerCourses.map((c) => [c.id, c])),
    [plannerCourses]
  );

  // The transcript's semesters grouped by the term they were taken in. A term
  // that still holds any registered (ungraded, "U") course is **in progress**,
  // not completed — the advisor grades those to finish it and advance the plan.
  // Courses with no parsed semester (e.g. manual entry) can't be grouped here.
  const { completedSemesters, inProgressSemesters, latestSemester } = useMemo(() => {
    const groups = new Map<
      number,
      { semester: Semester; courses: { code: string; title: string; grade: string }[] }
    >();
    for (const c of transcriptData.courses) {
      if (!c.semester) continue;
      const key = semesterIndex(c.semester);
      let g = groups.get(key);
      if (!g) {
        g = { semester: c.semester, courses: [] };
        groups.set(key, g);
      }
      g.courses.push({ code: c.code, title: c.title, grade: c.grade });
    }
    const all = [...groups.values()].sort((a, b) =>
      compareSemesters(a.semester, b.semester)
    );
    return {
      completedSemesters: all.filter(
        (g) => !g.courses.some((c) => UNGRADED_GRADES.has(c.grade))
      ),
      inProgressSemesters: all.filter((g) =>
        g.courses.some((c) => UNGRADED_GRADES.has(c.grade))
      ),
      latestSemester: all.length > 0 ? all[all.length - 1].semester : null,
    };
  }, [transcriptData]);

  // Canonical course code -> the graph node currently registered (ungraded) for
  // it, so the in-progress semester card can wire each registered course's grade
  // dropdown to the shared projected-grade map.
  const ungradedNodeByCode = useMemo(() => {
    const m = new Map<string, string>();
    if (!graph) return m;
    for (const n of graph.nodes) {
      if (effectiveStatus.get(n.id) === "ungraded") {
        m.set(canonicalizeCode((n.data as CourseNodeData).code), n.id);
      }
    }
    return m;
  }, [graph, effectiveStatus]);

  // The projection's starting point: the earned credits and GPA the student
  // *will* have once the current (in-progress) semester is graded. Baseline is
  // the parsed earned total / GPA (which exclude ungraded courses); each
  // registered course the advisor assigns a grade to then adds its credits and
  // grade points. Pass/fail training is left out of both totals.
  const planStart = useMemo(() => {
    let earned = achievedCreditHours;
    let gpaPoints = currentGpa.points;
    let gpaCredits = currentGpa.ch;
    if (graph) {
      const byId = new Map(graph.nodes.map((n) => [n.id, n]));
      for (const [id, grade] of projGrades) {
        const n = byId.get(id);
        if (!n || effectiveStatus.get(id) !== "ungraded") continue;
        if (!(grade in GRADE_POINTS)) continue;
        const code = (n.data as CourseNodeData).code;
        const isTraining =
          id.startsWith("elective-PROFESSIONAL") ||
          canonicalizeCode(code) === PRACTICAL_TRAINING_CANON;
        if (isTraining) continue; // pass/fail: no earned/GPA contribution
        const cv = creditValueForCode(code);
        earned += grade === "F" ? 0 : cv;
        gpaPoints += GRADE_POINTS[grade] * cv;
        gpaCredits += cv;
      }
    }
    return { earned, gpaPoints, gpaCredits };
  }, [achievedCreditHours, currentGpa, graph, projGrades, effectiveStatus]);

  // Score the advisor's hand-built plan. Earned credits and GPA start from the
  // projection base (achieved totals plus any graded current-semester courses)
  // and advance semester by semester using each placed course's projected grade.
  const plan = useMemo(
    () =>
      evaluateManualPlan({
        courses: plannerCourses,
        completedIds: plannerCompletedIds,
        startEarnedCredits: planStart.earned,
        startGpaPoints: planStart.gpaPoints,
        startGpaCredits: planStart.gpaCredits,
        terms: plannerTerms,
        gradePoints: GRADE_POINTS,
      }),
    [plannerCourses, plannerCompletedIds, planStart, plannerTerms]
  );

  // Which remaining courses may be added to each future semester (prereqs met by
  // that term's start, credit gate satisfied, Project I gated on probation).
  const eligibleByTerm = useMemo(
    () => plan.terms.map((t) => eligibleForTerm(t, plan.unplaced)),
    [plan]
  );

  // Node id -> the future term index it's placed in (for +/- affordance state).
  const placedTermById = useMemo(() => {
    const m = new Map<string, number>();
    plannerTerms.forEach((term, ti) => {
      for (const e of term.entries) m.set(e.id, ti);
    });
    return m;
  }, [plannerTerms]);

  // The set of course ids eligible to be added to the active target term.
  const activeEligibleIds = useMemo(() => {
    if (activePlannerTerm === null) return new Set<string>();
    return new Set((eligibleByTerm[activePlannerTerm] ?? []).map((c) => c.id));
  }, [eligibleByTerm, activePlannerTerm]);

  // Calendar-style label for each future semester
  const planTermLabels = useMemo(() => {
    return plan.terms.map((t, i) => {
      if (t.semester?.label) return t.semester.label;
      if (t.isSummer) return `Summer Semester ${i + 1}`;
      return `Planned Semester ${i + 1}`;
    });
  }, [plan.terms]);

  // Whether a Summer semester can be added at the end of the plan
  const canAddSummerAtEnd = useMemo(() => {
    const lastTerm =
      plan.terms.length > 0
        ? plan.terms[plan.terms.length - 1]
        : null;
    if (lastTerm) {
      return lastTerm.semester?.term === "Second" && !lastTerm.isSummer;
    }
    return latestSemester?.term === "Second";
  }, [plan.terms, latestSemester]);

  // Set (or clear, with "") the projected grade of a registered course so the
  // current semester's contribution to the projection updates. Shared with the
  // GPA calculator's projected-grade map.
  const setRegisteredGrade = useCallback((nodeId: string, grade: string) => {
    setProjGrades((prev) => {
      const next = new Map(prev);
      if (grade === "") next.delete(nodeId);
      else next.set(nodeId, grade);
      return next;
    });
  }, []);

  // --- Planner edit handlers ---------------------------------------------
  const addSemester = useCallback(() => {
    setPlannerTerms((prev) => {
      const lastTerm = prev.length > 0 ? prev[prev.length - 1] : null;
      const prevSem = lastTerm ? lastTerm.semester : latestSemester;
      let nextSem: Semester | undefined;
      if (prevSem) {
        nextSem = nextPlanningSemester(prevSem);
      }
      const newTerm: PlannedTermInput = {
        entries: [],
        semester: nextSem,
        isSummer: false,
      };
      setActivePlannerTerm(prev.length); // target the freshly added term
      return [...prev, newTerm];
    });
  }, [latestSemester]);

  const addSummerSemester = useCallback(
    (afterIndex?: number) => {
      setPlannerTerms((prev) => {
        const targetIdx =
          afterIndex !== undefined ? afterIndex : prev.length - 1;
        const baseTerm =
          targetIdx >= 0 && prev[targetIdx] ? prev[targetIdx] : null;
        const baseSem = baseTerm ? baseTerm.semester : latestSemester;
        let summerSem: Semester | undefined;
        if (baseSem) {
          summerSem = getSummerSemester(baseSem);
        }
        const newTerm: PlannedTermInput = {
          entries: [],
          semester: summerSem,
          isSummer: true,
        };
        const next = [...prev];
        const insertAt = targetIdx + 1;
        next.splice(insertAt, 0, newTerm);
        setActivePlannerTerm(insertAt);
        return next;
      });
    },
    [latestSemester]
  );

  const removeSemester = useCallback((termIndex: number) => {
    setPlannerTerms((prev) => prev.filter((_, i) => i !== termIndex));
    // Keep the active target pointing at the same term (or clear it if removed).
    setActivePlannerTerm((cur) => {
      if (cur === null) return null;
      if (cur === termIndex) return null;
      return cur > termIndex ? cur - 1 : cur;
    });
  }, []);

  const addCourseToTerm = useCallback(
    (termIndex: number, courseId: string) => {
      if (!courseId) return;
      const c = plannerCourseById.get(courseId);
      // Pass/fail courses (training) carry no letter grade.
      const grade = c && c.gpaCredit === 0 ? "P" : DEFAULT_PLAN_GRADE;
      setPlannerTerms((prev) =>
        prev.map((term, i) =>
          i === termIndex
            ? { ...term, entries: [...term.entries, { id: courseId, grade }] }
            : term
        )
      );
    },
    [plannerCourseById]
  );

  const removeCourseFromTerm = useCallback(
    (termIndex: number, courseId: string) => {
      setPlannerTerms((prev) =>
        prev.map((term, i) =>
          i === termIndex
            ? {
                ...term,
                entries: term.entries.filter((e) => e.id !== courseId),
              }
            : term
        )
      );
    },
    []
  );

  const setEntryGrade = useCallback(
    (termIndex: number, courseId: string, grade: string) => {
      setPlannerTerms((prev) =>
        prev.map((term, i) =>
          i === termIndex
            ? {
                ...term,
                entries: term.entries.map((e) =>
                  e.id === courseId ? { ...e, grade } : e
                ),
              }
            : term
        )
      );
    },
    []
  );

  const clearPlan = useCallback(() => {
    setPlannerTerms([]);
    setActivePlannerTerm(null);
    if (planStorageKey) {
      try {
        window.localStorage.removeItem(planStorageKey);
      } catch {
        // Ignore
      }
    }
  }, [planStorageKey]);

  const handlePrintPlan = useCallback(() => {
    const studentName =
      report.studentName || transcriptData.studentName || report.studentID;
    const originalTitle = document.title;
    document.title = `${studentName} - Semester Study Plan`;
    document.body.classList.add("printing-semester-plan");

    logAdvisorAction({
      action: "SEMESTER_PLAN_PRINTED",
      studentId: report.studentID,
      studentName: report.studentName,
      department: report.department,
      metadata: {
        termsCount: plannerTerms.length,
        projectedGpa: plan.finalGpa,
        projectedCredits: plan.finalEarnedCredits,
      },
    });

    const cleanup = () => {
      document.body.classList.remove("printing-semester-plan");
      document.title = originalTitle;
      window.removeEventListener("afterprint", cleanup);
    };
    window.addEventListener("afterprint", cleanup);

    setTimeout(() => {
      window.print();
      setTimeout(cleanup, 1200);
    }, 100);
  }, [report, transcriptData, plannerTerms, plan]);

  // Close print preview on Escape key
  useEffect(() => {
    if (!showPrintModal) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPrintModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showPrintModal]);

  // Two chains from the selected node:
  //  - prereqSet: all its transitive prerequisites (what must come before it).
  //  - dependentSet: everything it transitively unlocks (what it's a prereq of).
  // The selected id is deliberately excluded from both.
  const { prereqSet, dependentSet } = useMemo(() => {
    const prereqSet = new Set<string>();
    const dependentSet = new Set<string>();
    if (!selectedId) return { prereqSet, dependentSet };

    const walk = (adjacency: Map<string, string[]>, out: Set<string>) => {
      const stack = [selectedId];
      const seen = new Set<string>([selectedId]);
      while (stack.length) {
        const cur = stack.pop()!;
        for (const next of adjacency.get(cur) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            out.add(next);
            stack.push(next);
          }
        }
      }
    };
    walk(prereqsByTarget, prereqSet);
    walk(dependentsBySource, dependentSet);
    return { prereqSet, dependentSet };
  }, [selectedId, prereqsByTarget, dependentsBySource]);

  // Every node touched by the selection (both chains plus the node itself).
  const highlightSet = useMemo(() => {
    const set = new Set<string>();
    if (!selectedId) return set;
    set.add(selectedId);
    for (const id of prereqSet) set.add(id);
    for (const id of dependentSet) set.add(id);
    return set;
  }, [selectedId, prereqSet, dependentSet]);

  // Highlight-on-click is disabled while planning, so selection only applies
  // outside manual mode.
  const activeSelection = manualMode ? null : selectedId;

  // Apply status/selection styling to nodes without rebuilding the graph.
  const displayNodes = useMemo<Node[]>(() => {
    if (!graph) return [];
    const planning = plannerMode && activePlannerTerm !== null;
    const courseNodes = graph.nodes.map((n) => {
      const status = effectiveStatus.get(n.id) ?? (n.data as CourseNodeData).status;
      const inChain = highlightSet.has(n.id);
      const selecting = activeSelection != null;

      // Planner affordances for the active target term: eligible remaining
      // courses get a "+" to add; a course already placed in the active term
      // gets a "−" to remove; one placed in another term shows a "Planned" tag.
      let plannerGlow: CourseNodeData["plannerGlow"] = null;
      let plannerAffordance: CourseNodeData["plannerAffordance"] = null;
      let onPlannerToggle: (() => void) | undefined;
      if (planning) {
        const placedTerm = placedTermById.get(n.id);
        if (placedTerm === activePlannerTerm) {
          plannerGlow = "placed";
          plannerAffordance = "remove";
          onPlannerToggle = () =>
            removeCourseFromTerm(activePlannerTerm, n.id);
        } else if (placedTerm !== undefined) {
          plannerGlow = "placed-other";
        } else if (activeEligibleIds.has(n.id)) {
          plannerGlow = "eligible";
          plannerAffordance = "add";
          onPlannerToggle = () => addCourseToTerm(activePlannerTerm, n.id);
        }
      }

      return {
        ...n,
        data: {
          ...n.data,
          status,
          manualMode,
          override: overrides.get(n.id) ?? null,
          emphasis: !selecting
            ? null
            : n.id === activeSelection
            ? "selected"
            : prereqSet.has(n.id)
            ? "prereq"
            : dependentSet.has(n.id)
            ? "dependent"
            : null,
          dim: selecting ? !inChain : false,
          plannerGlow,
          plannerAffordance,
          onPlannerToggle,
        },
      };
    });
    // Headers are static; append them so they render above the columns.
    return [...termNodes, ...courseNodes];
  }, [graph, termNodes, effectiveStatus, manualMode, overrides, activeSelection, highlightSet, prereqSet, dependentSet, plannerMode, activePlannerTerm, placedTermById, activeEligibleIds, addCourseToTerm, removeCourseFromTerm]);

  const displayEdges = useMemo<Edge[]>(() => {
    if (!graph) return [];
    if (!activeSelection) return graph.edges;
    const upstream = new Set<string>([activeSelection, ...prereqSet]);
    const downstream = new Set<string>([activeSelection, ...dependentSet]);
    return graph.edges.map((e) => {
      // An edge belongs to the prereq chain if both ends are upstream, or to
      // the dependents chain if both ends are downstream.
      const onPrereq = upstream.has(e.source) && upstream.has(e.target);
      const onDependent = downstream.has(e.source) && downstream.has(e.target);
      const color = onPrereq ? "#f59e0b" : onDependent ? "#14b8a6" : "#e2e8f0";
      const onChain = onPrereq || onDependent;
      return {
        ...e,
        animated: onChain,
        style: {
          stroke: color,
          strokeWidth: onChain ? 2 : 1,
          opacity: onChain ? 1 : 0.35,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color,
        },
      };
    });
  }, [graph, activeSelection, prereqSet, dependentSet]);

  const handleNodeClick = useCallback(
    (_: unknown, node: Node) => {
      if (node.type === "term") return; // headers aren't interactive
      if (manualMode) {
        // Cycle the override: Auto -> Registered -> Finished -> Not taken -> Auto.
        const cur = overrides.get(node.id);
        const idx = OVERRIDE_CYCLE.indexOf(cur);
        const val = OVERRIDE_CYCLE[(idx + 1) % OVERRIDE_CYCLE.length];

        // Probation half-load: block registering a course that would push the
        // total registered credit hours past the 12 Cr cap.
        const alreadyRegistered = effectiveStatus.get(node.id) === "ungraded";
        if (val === "ungraded" && onProbation && !alreadyRegistered) {
          const nodeCredits = creditValueForCode(
            (node.data as CourseNodeData).code
          );
          if (registeredCredits + nodeCredits > PROBATION_HALF_LOAD_CREDITS) {
            setCapWarning(
              `Probation half-load: at most ${PROBATION_HALF_LOAD_CREDITS} Cr. may be registered (${registeredCredits} Cr. already registered).`
            );
            return;
          }
        }
        setCapWarning(null);

        setOverrides((prev) => {
          const next = new Map(prev);
          if (val === undefined) next.delete(node.id);
          else next.set(node.id, val);
          return next;
        });
        return;
      }
      setSelectedId((cur) => (cur === node.id ? null : node.id));
    },
    [manualMode, overrides, onProbation, effectiveStatus, registeredCredits]
  );
  const handlePaneClick = useCallback(() => setSelectedId(null), []);

  // The graph canvas contents, reused by the standalone layout and the planner
  // workspace (which sizes its wrapper differently). The wrapper supplies height.
  const graphCanvas = error ? (
    <div className="h-full flex items-center justify-center text-red-600 text-sm">
      {error}
    </div>
  ) : !graph ? (
    <div className="h-full flex items-center justify-center text-gray-500 text-sm">
      Building course graph…
    </div>
  ) : (
    <ReactFlow
      nodes={displayNodes}
      edges={displayEdges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      fitView
      minZoom={0.15}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls />
      <MiniMap nodeColor={miniMapColor} pannable zoomable />
    </ReactFlow>
  );

  return (
    <div className="p-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {/* Department switcher: view this transcript against another plan. */}
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          Department:
          <select
            value={activeDept}
            onChange={(e) => handleDeptChange(e.target.value as Department)}
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d} className="text-gray-900 bg-white">
                {DEPARTMENT_NAMES[d]} ({d})
                {d === initialReport.department ? " — detected" : ""}
              </option>
            ))}
          </select>
        </label>
        {deptLoading && (
          <span className="text-xs text-gray-500">Loading plan…</span>
        )}
        {activeDept !== initialReport.department && !deptLoading && (
          <span className="text-xs text-amber-600">
            Viewing against {activeDept} plan (not the detected department)
          </span>
        )}

        <button
          type="button"
          onClick={() => {
            setManualMode((m) => {
              // Manual and Semester planner both own the node click, so they're
              // mutually exclusive — turning one on turns the other off.
              if (!m) setPlannerMode(false);
              return !m;
            });
            setSelectedId(null);
            setCapWarning(null);
          }}
          className={`text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${
            manualMode
              ? "bg-indigo-600 border-indigo-600 text-white"
              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {manualMode ? "Manual planning: ON" : "Manual planning: OFF"}
        </button>
        <button
          type="button"
          onClick={() => setGpaMode((m) => !m)}
          className={`text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${
            gpaMode
              ? "bg-emerald-600 border-emerald-600 text-white"
              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {gpaMode ? "GPA calculator: ON" : "GPA calculator: OFF"}
        </button>
        <button
          type="button"
          onClick={() =>
            setPlannerMode((m) => {
              if (!m) {
                // Planner takes the node click from manual mode (mutually
                // exclusive) and clears any lingering highlight selection.
                setManualMode(false);
                setSelectedId(null);
              }
              return !m;
            })
          }
          className={`text-sm font-medium px-3 py-1.5 rounded-md border transition-colors ${
            plannerMode
              ? "bg-sky-600 border-sky-600 text-white"
              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {plannerMode ? "Semester planner: ON" : "Semester planner: OFF"}
        </button>

        {/* Achieved credit-hour tally (updates live with manual overrides). */}
        <span className="text-sm font-medium px-3 py-1.5 rounded-md bg-gray-100 border border-gray-200 text-gray-700">
          Achieved credit hours:{" "}
          <span className="font-bold text-gray-900">{achievedCreditHours}</span>
          {achievedCreditHours !== report.totalCreditHours && (
            <span className="ml-1 text-indigo-600">
              ({achievedCreditHours > report.totalCreditHours ? "+" : ""}
              {achievedCreditHours - report.totalCreditHours} vs transcript)
            </span>
          )}
        </span>

        {/* Registered-credit tally against the probation half-load cap. */}
        {onProbation && manualMode && (
          <span
            className={`text-sm font-medium px-3 py-1.5 rounded-md border ${
              registeredCredits > PROBATION_HALF_LOAD_CREDITS
                ? "bg-red-100 border-red-300 text-red-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            Registered:{" "}
            <span className="font-bold">
              {registeredCredits}/{PROBATION_HALF_LOAD_CREDITS} Cr.
            </span>{" "}
            (half-load)
          </span>
        )}

        {manualMode && overrides.size > 0 && (
          <button
            type="button"
            onClick={() => setOverrides(new Map())}
            className="text-xs font-medium px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 ml-auto"
          >
            Reset {overrides.size} change{overrides.size === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {/* Probation (half-load) notice for the graph view. */}
      {onProbation && (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          <span className="font-semibold text-red-800">
            Academic probation (half-load)
          </span>
          {report.probationSemesters > 0 && (
            <span
              className={`ml-2 text-xs font-bold px-2 py-0.5 rounded-full ${
                report.probationSemestersExceeded
                  ? "bg-red-700 text-white"
                  : "bg-red-200 text-red-800"
              }`}
            >
              Semester {report.probationSemesters} of 3
            </span>
          )}
          <span className="ml-2">
            GPA{report.gpa !== null ? ` (${report.gpa})` : ""} below 2.0 —
            registration is capped at {PROBATION_HALF_LOAD_CREDITS} Cr. and
            Project I is blocked.
          </span>
        </div>
      )}

      {capWarning && (
        <div className="mb-3 rounded-md border border-red-400 bg-red-100 px-3 py-2 text-sm font-medium text-red-800">
          {capWarning}
        </div>
      )}

      {manualMode && (
        <p className="text-xs text-gray-500 mb-3 -mt-1">
          Click a course to cycle: Auto → Registered → Finished → Not taken.
          Availability and credit hours update from prerequisites.
        </p>
      )}

      {/* GPA calculator panel */}
      {gpaMode && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="flex flex-wrap items-center gap-6 mb-3">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Current GPA
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {currentGpa.gpa.toFixed(3)}
              </div>
            </div>
            <div className="text-2xl text-gray-300">→</div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Projected GPA
              </div>
              <div className="text-2xl font-bold text-emerald-700">
                {projectedGpa.gpa.toFixed(3)}
              </div>
            </div>
            {projectedGpa.count > 0 && (
              <button
                type="button"
                onClick={() => setProjGrades(new Map())}
                className="text-xs font-medium px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 ml-auto"
              >
                Clear grades
              </button>
            )}
          </div>

          {registeredNodes.length === 0 ? (
            <p className="text-xs text-gray-500">
              No registered courses to project. Turn on Manual planning and mark
              courses as “Registered” to assign hypothetical grades.
            </p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-500 mb-2">
                Assign a hypothetical grade to each registered course to see your
                projected GPA.
              </p>
              {registeredNodes.map((n) => {
                const d = n.data as CourseNodeData;
                return (
                  <div
                    key={n.id}
                    className="flex items-center gap-2 text-sm bg-white rounded border border-gray-200 px-2 py-1.5"
                  >
                    <span className="font-mono text-xs font-semibold bg-gray-100 px-1.5 py-0.5 rounded">
                      {d.code}
                    </span>
                    <span className="flex-1 truncate text-gray-700">
                      {d.title}
                    </span>
                    <span className="text-xs text-gray-400">
                      {creditValueForCode(d.code)} cr
                    </span>
                    <select
                      value={projGrades.get(n.id) ?? ""}
                      onChange={(e) =>
                        setProjGrades((prev) => {
                          const next = new Map(prev);
                          if (e.target.value === "") next.delete(n.id);
                          else next.set(n.id, e.target.value);
                          return next;
                        })
                      }
                      className="text-sm border border-gray-300 rounded px-1.5 py-1 bg-white text-gray-900 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="" className="text-gray-900 bg-white">—</option>
                      {PROJECTABLE_GRADES.map((g) => (
                        <option key={g} value={g} className="text-gray-900 bg-white">
                          {g} ({GRADE_POINTS[g].toFixed(2)})
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Semester planner workspace: side-by-side layout with full-height graph on the left and vertical collapsible sheet on the right */}
      {plannerMode && (
        <div className="mb-4 flex flex-col h-[calc(100vh-14rem)] min-h-[620px] rounded-lg border border-sky-200 bg-sky-50/40 p-3">
          {/* Summary + controls */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-2 shrink-0">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Planned semesters
              </div>
              <div className="text-2xl font-bold text-sky-700">
                {plannerTerms.length}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Left to place
              </div>
              <div
                className={`text-2xl font-bold ${
                  plan.unplaced.length > 0 ? "text-amber-600" : "text-green-600"
                }`}
              >
                {plan.unplaced.length}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Projected GPA
                {plan.unplaced.length > 0 ? " (so far)" : " at graduation"}
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {plan.finalGpa === null ? "—" : plan.finalGpa.toFixed(3)}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-500">
                Projected credit hours
              </div>
              <div className="text-2xl font-bold text-gray-900">
                {plan.finalEarnedCredits}
                <span className="text-sm font-medium text-gray-400">
                  {" "}
                  / {GRADUATION_CREDIT_HOURS}
                </span>
              </div>
            </div>

            {planSavedNotice && (
              <div className="self-center">
                <span className="text-[11px] font-medium text-emerald-800 bg-emerald-100/90 border border-emerald-300 px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-2xs">
                  <span>💾</span> {planSavedNotice}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={addSemester}
                className="text-xs font-semibold px-3 py-1.5 rounded-md bg-sky-600 text-white hover:bg-sky-700 shadow-sm flex items-center gap-1"
              >
                <span>＋</span> Add semester
              </button>

              {canAddSummerAtEnd && (
                <button
                  type="button"
                  onClick={() => addSummerSemester()}
                  title="Add optional Summer Semester (6 Cr normal load, up to 9 Cr)"
                  className="text-xs font-semibold px-3 py-1.5 rounded-md bg-amber-600 text-white hover:bg-amber-700 shadow-sm flex items-center gap-1"
                >
                  <span>☀️</span> Add Summer
                </button>
              )}

              {plannerTerms.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowPrintModal(true)}
                    title="Print or save semester plan as PDF for the student"
                    className="text-xs font-semibold px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm flex items-center gap-1.5 transition-colors"
                  >
                    <span>🖨️</span> Print Plan
                  </button>

                  <button
                    type="button"
                    onClick={clearPlan}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 bg-white"
                  >
                    Clear plan
                  </button>
                </>
              )}

              <button
                type="button"
                onClick={() => setIsSheetCollapsed((prev) => !prev)}
                title={isSheetCollapsed ? "Expand semester sheet" : "Collapse semester sheet"}
                className="text-xs font-medium px-2.5 py-1.5 rounded-md border border-sky-300 text-sky-700 hover:bg-sky-100 bg-white flex items-center gap-1.5"
              >
                {isSheetCollapsed ? (
                  <>
                    <span>⇥</span> Expand Plan ({plannerTerms.length})
                  </>
                ) : (
                  <>
                    <span>⇤</span> Hide Plan Sheet
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Active-term hint: what the graph's "+" buttons will fill. */}
          <div className="mb-2 shrink-0 flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-white border border-sky-200 text-xs">
            {activePlannerTerm !== null && plan.terms[activePlannerTerm] ? (
              <span className="text-sky-800">
                🎯 Target semester:{" "}
                <span className="font-bold text-sky-900">
                  {planTermLabels[activePlannerTerm]}
                </span>{" "}
                {plan.terms[activePlannerTerm].isSummer && (
                  <span className="ml-1 text-[11px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-300">
                    ☀️ Summer: 6 Cr normal (9 Cr max)
                  </span>
                )}{" "}
                — Click <span className="font-bold text-green-600">＋</span> on glowing courses in graph to add, or <span className="font-bold text-indigo-600">−</span> to remove.
              </span>
            ) : (
              <span className="text-gray-600">
                💡 Select a semester in the plan sheet on the right, then click{" "}
                <span className="font-bold text-green-600">＋</span> on eligible courses in the graph. (Caps: Yrs 1–2 18 Cr · Yrs 3–4 15 Cr · Summer 6 Cr normal / 9 max · Overload 21 Cr at ≥{PLANNER_OVERLOAD_GPA_THRESHOLD.toFixed(1)} GPA · Half-load 12 Cr at &lt;{PROBATION_GPA_THRESHOLD.toFixed(1)} GPA).
              </span>
            )}

            {activePlannerTerm !== null && (
              <button
                type="button"
                onClick={() => setActivePlannerTerm(null)}
                className="text-[11px] text-sky-600 hover:text-sky-800 underline font-medium ml-auto shrink-0"
              >
                Deselect target
              </button>
            )}
          </div>

          {/* Side-by-side workspace: Interactive graph on the left, vertical sheet on the right */}
          <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">
            {/* Prerequisite graph canvas */}
            <div className="flex-1 min-h-0 h-full rounded-lg border border-gray-200 bg-gray-50 relative overflow-hidden">
              {graphCanvas}

              {/* Floating quick-toggle button if sheet is collapsed */}
              {isSheetCollapsed && (
                <button
                  type="button"
                  onClick={() => setIsSheetCollapsed(false)}
                  className="absolute top-3 right-3 z-10 bg-white/95 backdrop-blur-sm border border-sky-300 text-sky-800 hover:bg-sky-50 shadow-md px-3 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-transform hover:scale-105"
                >
                  <span>‹</span> Open Semester Plan ({plannerTerms.length} terms)
                </button>
              )}
            </div>

            {/* Vertical Collapsible Sheet */}
            {!isSheetCollapsed ? (
              <div className="w-96 shrink-0 flex flex-col h-full bg-white rounded-lg border border-sky-200 shadow-sm overflow-hidden">
                {/* Sheet Header */}
                <div className="px-3 py-2.5 bg-sky-50/80 border-b border-sky-200 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-sky-900">
                      Semester Plan
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-700">
                      {plannerTerms.length} {plannerTerms.length === 1 ? "term" : "terms"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {plannerTerms.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setShowPrintModal(true)}
                        title="Print Semester Plan"
                        className="px-2 py-0.5 rounded text-emerald-700 bg-emerald-50 hover:bg-emerald-100 hover:text-emerald-900 border border-emerald-200 transition-colors flex items-center gap-1 text-[11px] font-bold"
                      >
                        <span>🖨️</span>
                        <span>Print</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsSheetCollapsed(true)}
                      title="Collapse sheet"
                      className="p-1 rounded text-gray-500 hover:bg-sky-100 hover:text-sky-800"
                    >
                      <span className="text-sm font-bold">›</span>
                    </button>
                  </div>
                </div>

                {/* Scrollable Semesters List */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {/* Completed Semesters Accordion */}
                  {completedSemesters.length > 0 && (
                    <div className="rounded-lg border border-green-200 bg-green-50/30 overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setShowCompletedTerms((prev) => !prev)}
                        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-green-50/70 transition-colors"
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs">{showCompletedTerms ? "▼" : "▶"}</span>
                          <span className="text-xs font-bold text-green-900">
                            Completed Semesters ({completedSemesters.length})
                          </span>
                        </div>
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                          {completedSemesters.reduce(
                            (acc, s) =>
                              acc +
                              s.courses.reduce(
                                (sum, c) =>
                                  PASSING_GRADES.has(c.grade)
                                    ? sum + creditValueForCode(c.code)
                                    : sum,
                                0
                              ),
                            0
                          )}{" "}
                          Cr
                        </span>
                      </button>

                      {showCompletedTerms && (
                        <div className="p-2 pt-0 space-y-2 border-t border-green-100 mt-1">
                          {completedSemesters.map((s) => {
                            const earned = s.courses.reduce(
                              (sum, c) =>
                                PASSING_GRADES.has(c.grade)
                                  ? sum + creditValueForCode(c.code)
                                  : sum,
                              0
                            );
                            return (
                              <div
                                key={s.semester.label}
                                className="rounded border border-green-200 bg-white p-2 shadow-2xs"
                              >
                                <div className="flex items-center justify-between mb-1.5">
                                  <span className="text-[11px] font-bold text-green-800">
                                    {s.semester.label}
                                  </span>
                                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-green-50 text-green-700">
                                    {earned} Cr
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  {s.courses.map((c, ci) => {
                                    const bad = c.grade === "F" || c.grade === "W";
                                    return (
                                      <div
                                        key={`${c.code}-${ci}`}
                                        className="flex items-center gap-1.5 text-[11px] py-0.5"
                                      >
                                        <span className="font-mono font-semibold bg-gray-50 px-1 rounded text-gray-800">
                                          {c.code}
                                        </span>
                                        <span className="truncate flex-1 text-gray-600">
                                          {c.title}
                                        </span>
                                        <span
                                          className={`text-[10px] font-bold px-1 rounded ${
                                            bad
                                              ? "bg-red-100 text-red-700"
                                              : "bg-green-100 text-green-800"
                                          }`}
                                        >
                                          {c.grade}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* In-Progress Semesters */}
                  {inProgressSemesters.map((s) => {
                    const graded = s.courses.filter(
                      (c) => !UNGRADED_GRADES.has(c.grade)
                    ).length;
                    return (
                      <div
                        key={`inprogress-${s.semester.label}`}
                        className="rounded-lg border border-amber-300 bg-amber-50/50 p-2.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-amber-200">
                          <div>
                            <span className="text-xs font-bold text-amber-900 block">
                              {s.semester.label}
                            </span>
                            <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-700">
                              Current Semester (In Progress)
                            </span>
                          </div>
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            {graded}/{s.courses.length} graded
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {s.courses.map((c, ci) => {
                            const registered = UNGRADED_GRADES.has(c.grade);
                            const nodeId = registered
                              ? ungradedNodeByCode.get(canonicalizeCode(c.code))
                              : undefined;
                            const projected = nodeId ? projGrades.get(nodeId) : undefined;
                            return (
                              <div
                                key={`${c.code}-${ci}`}
                                className="rounded border border-amber-200 bg-white p-1.5 text-xs"
                              >
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-[10px] font-semibold bg-amber-50 px-1 rounded text-amber-900">
                                    {c.code}
                                  </span>
                                  <span className="text-[10px] text-gray-400">
                                    {creditValueForCode(c.code)} cr
                                  </span>
                                  {registered && nodeId ? (
                                    <select
                                      value={projected ?? ""}
                                      onChange={(ev) =>
                                        setRegisteredGrade(nodeId, ev.target.value)
                                      }
                                      className="text-[11px] border border-amber-300 rounded px-1 py-0.5 bg-white text-amber-950 ml-auto font-medium focus:outline-none focus:ring-1 focus:ring-amber-500"
                                      title="Assign projected grade"
                                    >
                                      <option value="" className="text-gray-900 bg-white">In progress (U)</option>
                                      {PROJECTABLE_GRADES.map((g) => (
                                        <option key={g} value={g} className="text-gray-900 bg-white">
                                          {g}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <span className="text-[10px] font-semibold ml-auto px-1 rounded bg-gray-100 text-gray-600">
                                      {c.grade}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-gray-700 truncate mt-0.5">
                                  {c.title}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}

                  {/* Planned Future Semesters */}
                  {plan.terms.map((t, ti) => {
                    const overCeiling = t.load > t.ceiling;
                    const overNormal = t.isSummer
                      ? t.load > t.cap && !overCeiling
                      : t.load > t.cap && !overCeiling;
                    const candidates = eligibleByTerm[ti] ?? [];
                    const isActive = activePlannerTerm === ti;
                    const cumulativeCredits =
                      ti + 1 < plan.terms.length
                        ? plan.terms[ti + 1].earnedAtStart
                        : plan.finalEarnedCredits;

                    const isSecondSemester =
                      t.semester?.term === "Second" ||
                      (!t.isSummer && ti % 2 === 1);
                    const nextTerm = plan.terms[ti + 1];
                    const canInsertSummerAfter =
                      isSecondSemester && (!nextTerm || !nextTerm.isSummer);

                    return (
                      <div
                        key={`plan-${t.index}`}
                        className={`rounded-lg border bg-white shadow-2xs transition-all ${
                          t.isSummer
                            ? isActive
                              ? "border-amber-500 ring-2 ring-amber-400 bg-amber-50/15"
                              : "border-amber-200 hover:border-amber-300"
                            : isActive
                            ? "border-sky-500 ring-2 ring-sky-400 bg-sky-50/10"
                            : "border-sky-200 hover:border-sky-300"
                        }`}
                      >
                        {/* Term Card Header */}
                        <div
                          onClick={() =>
                            setActivePlannerTerm((cur) => (cur === ti ? null : ti))
                          }
                          className={`p-2.5 border-b cursor-pointer select-none transition-colors ${
                            t.isSummer
                              ? isActive
                                ? "bg-amber-50 border-amber-200"
                                : "bg-amber-50/40 border-amber-100 hover:bg-amber-50/70"
                              : isActive
                              ? "bg-sky-50 border-sky-200"
                              : "bg-gray-50/60 border-gray-100 hover:bg-sky-50/30"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5">
                              {isActive ? (
                                <span
                                  className={`${
                                    t.isSummer ? "bg-amber-600" : "bg-sky-600"
                                  } text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shadow-2xs`}
                                >
                                  Target
                                </span>
                              ) : (
                                <span className="text-gray-400 text-[10px] font-medium hover:text-sky-600">
                                  Click to fill ⊕
                                </span>
                              )}
                              {t.isSummer && (
                                <span className="text-[10px] font-bold text-amber-900 bg-amber-100 px-1.5 py-0.2 rounded border border-amber-200">
                                  ☀️ Summer
                                </span>
                              )}
                              <span
                                className={`text-xs font-bold ${
                                  t.isSummer ? "text-amber-950" : "text-sky-950"
                                }`}
                              >
                                {planTermLabels[ti]}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span
                                className={`text-[11px] font-bold px-1.5 py-0.5 rounded ${
                                  overCeiling
                                    ? "bg-red-100 text-red-700"
                                    : overNormal
                                    ? t.isSummer
                                      ? "bg-amber-200 text-amber-900 border border-amber-300"
                                      : "bg-amber-100 text-amber-700"
                                    : t.isSummer
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-sky-100 text-sky-800"
                                }`}
                                title={
                                  t.isSummer
                                    ? `Summer Load ${t.load} Cr · normal load ${t.cap} Cr · max allowed ${t.ceiling} Cr`
                                    : `Load ${t.load} Cr · normal cap ${t.cap} · max ceiling ${t.ceiling}`
                                }
                              >
                                {t.isSummer
                                  ? overNormal
                                    ? `${t.load}/9 Cr (${t.cap} normal)`
                                    : `${t.load}/${t.cap} Cr`
                                  : `${t.load}/${t.ceiling} Cr`}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeSemester(ti);
                                }}
                                title="Remove this semester"
                                className="text-[12px] leading-none p-1 rounded text-gray-400 hover:bg-red-50 hover:text-red-600"
                              >
                                ✕
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 text-[10px] flex-wrap text-gray-500">
                            <span
                              className={`font-semibold px-1.5 py-0.5 rounded ${
                                t.isSummer
                                  ? "text-amber-900 bg-amber-100/80"
                                  : "text-sky-900 bg-sky-100/80"
                              }`}
                              title="Total cumulative earned credit hours after completing this semester"
                            >
                              Total: {cumulativeCredits}/{GRADUATION_CREDIT_HOURS} Cr
                            </span>
                            {t.isSummer && (
                              <span className="text-[10px] text-amber-800 font-medium">
                                (6 Cr normal · 9 max)
                              </span>
                            )}
                            {t.overload && (
                              <span className="font-semibold uppercase bg-amber-100 text-amber-700 px-1 rounded">
                                Overload
                              </span>
                            )}
                            {t.probation && (
                              <span className="font-semibold uppercase bg-red-100 text-red-700 px-1 rounded">
                                Half-load
                              </span>
                            )}
                            {t.gpaAtStart !== null && (
                              <span className="ml-auto font-medium text-gray-500">
                                Start GPA: {t.gpaAtStart.toFixed(2)}
                              </span>
                            )}
                          </div>

                          {/* Quick Add Summer button if this is a Second Semester */}
                          {canInsertSummerAfter && (
                            <div className="mt-1.5 pt-1.5 border-t border-sky-100/80 flex items-center justify-end">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addSummerSemester(ti);
                                }}
                                title="Add Summer semester after this term (6 Cr normal · 9 max)"
                                className="text-[10px] font-semibold text-amber-850 bg-amber-100/80 hover:bg-amber-200 px-2 py-0.5 rounded border border-amber-300 flex items-center gap-1 transition-colors"
                              >
                                <span>☀️</span> + Add Summer Semester
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Placed Courses List */}
                        <div className="p-2 space-y-1.5">
                          {t.entries.length === 0 && (
                            <div className="p-3 text-center rounded border border-dashed border-gray-200 bg-gray-50/50">
                              <p className="text-[11px] text-gray-500 font-medium">
                                No courses assigned yet.
                              </p>
                              <p className="text-[10px] text-sky-600 mt-0.5">
                                Click ＋ on glowing graph nodes or use dropdown below.
                              </p>
                            </div>
                          )}

                          {t.entries.map((e) => {
                            const c = plannerCourseById.get(e.id);
                            if (!c) return null;
                            const isElective = e.id.startsWith("elective-");
                            const isPassFail = c.gpaCredit === 0;
                            const tone = !e.valid
                              ? "border-red-300 bg-red-50"
                              : isElective
                              ? "border-purple-200 bg-purple-50/40"
                              : t.isSummer
                              ? "border-amber-200 bg-amber-50/40"
                              : "border-sky-200 bg-sky-50/40";

                            return (
                              <div
                                key={e.id}
                                className={`rounded border p-1.5 text-xs transition-colors ${tone}`}
                              >
                                <div className="flex items-center gap-1">
                                  <span className="font-mono text-[10px] font-bold bg-white px-1.5 py-0.5 rounded shadow-2xs border border-gray-200 text-gray-800">
                                    {c.code}
                                  </span>
                                  <span className="text-[10px] text-gray-500 font-medium">
                                    {c.loadCredit} cr
                                  </span>
                                  {isPassFail ? (
                                    <span className="text-[10px] font-medium text-gray-500 ml-auto bg-gray-100 px-1 rounded">
                                      Pass/Fail
                                    </span>
                                  ) : (
                                    <select
                                      value={e.grade}
                                      onChange={(ev) =>
                                        setEntryGrade(ti, e.id, ev.target.value)
                                      }
                                      className="text-[11px] border border-gray-300 rounded px-1 py-0.5 bg-white text-gray-900 ml-auto font-medium focus:outline-none focus:ring-1 focus:ring-sky-500"
                                      title="Projected grade"
                                    >
                                      {PROJECTABLE_GRADES.map((g) => (
                                        <option key={g} value={g} className="text-gray-900 bg-white">
                                          {g}
                                        </option>
                                      ))}
                                    </select>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => removeCourseFromTerm(ti, e.id)}
                                    title="Remove course from semester"
                                    className="text-[12px] leading-none p-1 rounded text-gray-400 hover:bg-white hover:text-red-600"
                                  >
                                    ✕
                                  </button>
                                </div>
                                <p className="text-[11px] text-gray-800 truncate mt-1">
                                  {c.title}
                                </p>
                                {!e.valid && e.reason && (
                                  <p className="text-[10px] text-red-600 mt-1 font-medium bg-red-100/60 rounded px-1 py-0.5">
                                    ⚠ {e.reason}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Add course dropdown */}
                        <div className="p-2 border-t border-gray-100 bg-gray-50/50">
                          <select
                            value=""
                            onChange={(ev) => addCourseToTerm(ti, ev.target.value)}
                            disabled={candidates.length === 0}
                            className={`w-full text-[11px] border rounded px-2 py-1 bg-white font-medium disabled:opacity-50 disabled:bg-gray-100 disabled:text-gray-400 ${
                              t.isSummer
                                ? "border-amber-300 text-amber-900"
                                : "border-sky-300 text-sky-900"
                            }`}
                          >
                            <option value="" className="text-gray-900 bg-white">
                              {candidates.length === 0
                                ? "No eligible courses for this term"
                                : `＋ Add course (${candidates.length} eligible)`}
                            </option>
                            {candidates.map((c) => (
                              <option key={c.id} value={c.id} className="text-gray-900 bg-white">
                                {c.code} — {c.title} ({c.loadCredit} cr)
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    );
                  })}

                  {/* Add Semester Buttons in sheet */}
                  {plannerCourses.length === 0 && plannerTerms.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-green-300 bg-green-50/40 p-4 text-center text-xs text-green-700">
                      All requirements are complete — nothing left to plan! 🎉
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={addSemester}
                        className="w-full py-2.5 rounded-lg border border-dashed border-sky-400 bg-sky-50/50 hover:bg-sky-100/60 text-sky-800 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>＋</span> Add next regular semester
                      </button>

                      {canAddSummerAtEnd && (
                        <button
                          type="button"
                          onClick={() => addSummerSemester()}
                          className="w-full py-2.5 rounded-lg border border-dashed border-amber-400 bg-amber-50/60 hover:bg-amber-100 text-amber-900 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors shadow-2xs"
                        >
                          <span>☀️</span> Add Summer semester (6 Cr normal · 9 max)
                        </button>
                      )}
                    </div>
                  )}

                  {plan.unplaced.length > 0 && plannerTerms.length > 0 && (
                    <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                      <span className="font-semibold">
                        {plan.unplaced.length} requirement
                        {plan.unplaced.length === 1 ? "" : "s"} not yet placed
                      </span>{" "}
                      — continue adding semesters to complete the graduation plan.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Slim vertical rail when collapsed */
              <div
                onClick={() => setIsSheetCollapsed(false)}
                title="Expand semester plan"
                className="w-11 shrink-0 bg-white rounded-lg border border-sky-300 hover:border-sky-500 hover:bg-sky-50/50 cursor-pointer shadow-sm flex flex-col items-center py-3 justify-between transition-all"
              >
                <div className="p-1 rounded bg-sky-100 text-sky-800 text-xs font-bold">
                  ‹
                </div>
                <div className="[writing-mode:vertical-rl] rotate-180 text-xs font-bold tracking-wider uppercase text-sky-900 my-auto">
                  Semester Plan ({plannerTerms.length})
                </div>
                <div className="text-[10px] font-bold px-1 py-0.5 rounded bg-sky-600 text-white">
                  {plannerTerms.length}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Legend + standalone graph — only outside the planner workspace, which
          renders its own graph docked above the term rail. */}
      {!plannerMode && (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            {LEGEND.map((status) => (
              <div key={status} className="flex items-center gap-1.5 text-xs">
                <span
                  className="inline-block w-3 h-3 rounded-sm border"
                  style={{ backgroundColor: STATUS_STYLES[status].mini }}
                />
                <span className="text-gray-600">
                  {STATUS_STYLES[status].label}
                </span>
              </div>
            ))}
            {!manualMode && (
              <span className="text-xs text-gray-400 ml-auto self-center">
                Tip: click a course to highlight its{" "}
                <span className="text-amber-600 font-medium">prerequisites</span>{" "}
                and the{" "}
                <span className="text-teal-600 font-medium">
                  courses it unlocks
                </span>
              </span>
            )}
          </div>

          <div className="h-[70vh] w-full rounded-lg border border-gray-200 bg-gray-50">
            {graphCanvas}
          </div>
        </>
      )}
      {/* Semester Plan Print Modal / Print View */}
      {showPrintModal &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="semester-plan-print-portal"
            className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-xs flex flex-col items-center justify-start p-4 md:p-8 print:p-0 print:m-0 print:bg-white print:overflow-visible"
          >
            {/* Modal Controls Bar (Hidden during printing) */}
            <div className="w-full max-w-5xl mb-3 flex items-center justify-between bg-white px-4 py-3 rounded-xl shadow-md border border-slate-200 print:hidden shrink-0">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">📄</span>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Semester Study Plan — Print Preview
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Official advising graduation roadmap for {report.studentName || report.studentID}.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrintModal(false)}
                  className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handlePrintPlan}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm flex items-center gap-1.5 transition-all transform hover:scale-[1.02]"
                >
                  <span>🖨️</span> Print / Save PDF
                </button>
              </div>
            </div>

            {/* Printable Document Paper Card */}
            <div className="w-full max-w-5xl bg-white shadow-2xl rounded-xl border border-slate-300 overflow-hidden print:shadow-none print:border-none print:max-w-none print:w-full print:rounded-none">
              <PrintableSemesterPlan
                report={report}
                transcriptData={transcriptData}
                plan={plan}
                plannerCourses={plannerCourses}
                plannerCourseById={plannerCourseById}
                planTermLabels={planTermLabels}
                inProgressSemesters={inProgressSemesters}
                projGrades={projGrades}
                ungradedNodeByCode={ungradedNodeByCode}
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
