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
import { AnalysisReport, TranscriptData, Department } from "@/types";
import {
  canonicalizeCode,
  isTwoCreditCourse,
  DEPARTMENTS,
  DEPARTMENT_NAMES,
} from "@/lib/constants";
import {
  buildCourseGraph,
  CourseStatus,
  GraphCourseNode,
} from "@/lib/analysis/courseGraphBuilder";
import { generateReport } from "@/lib/analysis/reportGenerator";

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

/** Credit-hour value of a course code (2 for UNR/CNC1401, else 3). */
function creditValueForCode(code: string): number {
  return isTwoCreditCourse(canonicalizeCode(code)) ? 2 : 3;
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
  "code" | "title" | "status" | "isElectiveSlot" | "creditReq"
> & {
  // Set when a node is selected: this node is either the selection, a
  // prerequisite of it, a course that depends on it, or dimmed (unrelated).
  emphasis?: "selected" | "prereq" | "dependent" | null;
  dim?: boolean;
  // Manual planning mode: whether it's active, and the user's override (if any).
  manualMode?: boolean;
  override?: Override | null;
};

function CourseNode({ data }: NodeProps<Node<CourseNodeData>>) {
  const styles = STATUS_STYLES[data.status];
  const ring =
    data.emphasis === "selected"
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
      className={`w-56 rounded-lg border-2 shadow-sm px-3 py-2 transition-opacity ${
        styles.card
      } ${data.isElectiveSlot ? "border-dashed" : ""} ${ring} ${
        data.dim ? "opacity-25" : "opacity-100"
      } ${data.manualMode ? "cursor-pointer" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-gray-400" />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs font-semibold bg-white/60 px-1.5 py-0.5 rounded">
          {data.code}
        </span>
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
      generateReport(initialReport.studentName, dept, transcriptData)
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
        // A fresh transcript invalidates any manual planning overrides and
        // projected grades.
        setOverrides(new Map());
        setProjGrades(new Map());
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
  }, [graph, overrides, prereqsByTarget, report.totalCreditHours]);

  // Current GPA from the parsed transcript: achieved points / GPA credit hours.
  const currentGpa = useMemo(() => {
    let points = 0;
    let ch = 0;
    for (const c of transcriptData.courses) {
      if (!GPA_COUNTED_GRADES.has(c.grade)) continue;
      const cv = creditValueForCode(c.code);
      points += GRADE_POINTS[c.grade] * cv;
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
    const courseNodes = graph.nodes.map((n) => {
      const status = effectiveStatus.get(n.id) ?? (n.data as CourseNodeData).status;
      const inChain = highlightSet.has(n.id);
      const selecting = activeSelection != null;
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
        },
      };
    });
    // Headers are static; append them so they render above the columns.
    return [...termNodes, ...courseNodes];
  }, [graph, termNodes, effectiveStatus, manualMode, overrides, activeSelection, highlightSet, prereqSet, dependentSet]);

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
        // Cycle the override: Auto -> Finished -> Registered -> Not taken -> Auto.
        setOverrides((prev) => {
          const next = new Map(prev);
          const cur = next.get(node.id);
          const idx = OVERRIDE_CYCLE.indexOf(cur);
          const val = OVERRIDE_CYCLE[(idx + 1) % OVERRIDE_CYCLE.length];
          if (val === undefined) next.delete(node.id);
          else next.set(node.id, val);
          return next;
        });
        return;
      }
      setSelectedId((cur) => (cur === node.id ? null : node.id));
    },
    [manualMode]
  );
  const handlePaneClick = useCallback(() => setSelectedId(null), []);

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
            className="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white"
          >
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>
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
            setManualMode((m) => !m);
            setSelectedId(null);
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
                      className="text-sm border border-gray-300 rounded px-1.5 py-1 bg-white"
                    >
                      <option value="">—</option>
                      {PROJECTABLE_GRADES.map((g) => (
                        <option key={g} value={g}>
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

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mb-4">
        {LEGEND.map((status) => (
          <div key={status} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block w-3 h-3 rounded-sm border"
              style={{ backgroundColor: STATUS_STYLES[status].mini }}
            />
            <span className="text-gray-600">{STATUS_STYLES[status].label}</span>
          </div>
        ))}
        {!manualMode && (
          <span className="text-xs text-gray-400 ml-auto self-center">
            Tip: click a course to highlight its{" "}
            <span className="text-amber-600 font-medium">prerequisites</span> and
            the{" "}
            <span className="text-teal-600 font-medium">courses it unlocks</span>
          </span>
        )}
      </div>

      <div className="h-[70vh] w-full rounded-lg border border-gray-200 bg-gray-50">
        {error ? (
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
        )}
      </div>
    </div>
  );
}
