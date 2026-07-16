"use client";

import { useEffect, useMemo, useState } from "react";
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
  buildCourseGraph,
  CourseStatus,
  GraphCourseNode,
} from "@/lib/analysis/courseGraphBuilder";

interface CourseGraphViewProps {
  report: AnalysisReport;
  transcriptData: TranscriptData;
}

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
  // prerequisite of it, or dimmed because it's unrelated.
  emphasis?: "selected" | "prereq" | null;
  dim?: boolean;
};

function CourseNode({ data }: NodeProps<Node<CourseNodeData>>) {
  const styles = STATUS_STYLES[data.status];
  const ring =
    data.emphasis === "selected"
      ? "ring-2 ring-offset-1 ring-blue-600"
      : data.emphasis === "prereq"
      ? "ring-2 ring-offset-1 ring-amber-500"
      : "";
  return (
    <div
      className={`w-56 rounded-lg border-2 shadow-sm px-3 py-2 transition-opacity ${
        styles.card
      } ${data.isElectiveSlot ? "border-dashed" : ""} ${ring} ${
        data.dim ? "opacity-25" : "opacity-100"
      }`}
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
      <Handle type="source" position={Position.Right} className="!bg-gray-400" />
    </div>
  );
}

const nodeTypes = { course: CourseNode };

const LEGEND: CourseStatus[] = [
  "completed",
  "available",
  "ungraded",
  "blocked",
  "failed",
  "elective",
];

export default function CourseGraphView({
  report,
  transcriptData,
}: CourseGraphViewProps) {
  const [graph, setGraph] = useState<{ nodes: Node[]; edges: Edge[] } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  // Currently selected course node (click to highlight its prerequisites).
  const [selectedId, setSelectedId] = useState<string | null>(null);

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
        setGraph({ nodes, edges });
        setSelectedId(null);
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
      STATUS_STYLES[(node.data as CourseNodeData).status]?.mini ?? "#9ca3af",
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

  // Selected node + all its transitive prerequisites (the full unlock chain).
  const highlightSet = useMemo(() => {
    const set = new Set<string>();
    if (!selectedId) return set;
    set.add(selectedId);
    const stack = [selectedId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const src of prereqsByTarget.get(cur) ?? []) {
        if (!set.has(src)) {
          set.add(src);
          stack.push(src);
        }
      }
    }
    return set;
  }, [selectedId, prereqsByTarget]);

  // Apply selection styling to nodes/edges without rebuilding the graph.
  const displayNodes = useMemo<Node[]>(() => {
    if (!graph) return [];
    if (!selectedId) {
      return graph.nodes.map((n) => ({
        ...n,
        data: { ...n.data, emphasis: null, dim: false },
      }));
    }
    return graph.nodes.map((n) => {
      const inChain = highlightSet.has(n.id);
      return {
        ...n,
        data: {
          ...n.data,
          emphasis: n.id === selectedId ? "selected" : inChain ? "prereq" : null,
          dim: !inChain,
        },
      };
    });
  }, [graph, selectedId, highlightSet]);

  const displayEdges = useMemo<Edge[]>(() => {
    if (!graph) return [];
    if (!selectedId) return graph.edges;
    return graph.edges.map((e) => {
      const onChain = highlightSet.has(e.source) && highlightSet.has(e.target);
      return {
        ...e,
        animated: onChain,
        style: {
          stroke: onChain ? "#f59e0b" : "#e2e8f0",
          strokeWidth: onChain ? 2 : 1,
          opacity: onChain ? 1 : 0.35,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: onChain ? "#f59e0b" : "#e2e8f0",
        },
      };
    });
  }, [graph, selectedId, highlightSet]);

  const handleNodeClick = useMemo(
    () => (_: unknown, node: Node) =>
      setSelectedId((cur) => (cur === node.id ? null : node.id)),
    []
  );
  const handlePaneClick = useMemo(() => () => setSelectedId(null), []);

  return (
    <div className="p-6">
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
        <span className="text-xs text-gray-400 ml-auto self-center">
          Tip: click a course to highlight its prerequisites
        </span>
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
