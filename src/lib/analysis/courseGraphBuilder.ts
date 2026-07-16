/**
 * Course Graph Builder
 * Transforms a department's course plan + a student's report/transcript into
 * nodes and edges for the prerequisite graph view.
 *
 * Pure/data-only (no React Flow types) so it stays testable and reusable.
 * Reuses the same prerequisite-parsing and code-normalization rules as
 * courseAnalyzer.ts / transcriptParser.ts so the graph stays consistent with
 * the report.
 */

import { AnalysisReport, TranscriptData, Department } from "@/types";
import { loadDepartmentData } from "@/lib/data/csvLoader";
import { getStudiedCourseCodes } from "./transcriptParser";
import { ELECTIVE_KEYWORDS, canonicalizeCode } from "@/lib/constants";

export type CourseStatus =
  | "completed"
  | "available"
  | "ungraded"
  | "failed"
  | "blocked"
  | "elective";

export interface GraphCourseNode {
  id: string;
  code: string;
  title: string;
  status: CourseStatus;
  isElectiveSlot: boolean;
  creditReq?: string; // e.g. "30 CR" when the prerequisite is a credit-hour gate
  position: { x: number; y: number };
}

export interface GraphCourseEdge {
  id: string;
  source: string;
  target: string;
}

export interface CourseGraph {
  nodes: GraphCourseNode[];
  edges: GraphCourseEdge[];
}

// Layout spacing (px)
const COL_SPACING = 280;
const ROW_SPACING = 110;

/** Normalize + resolve equivalences, exactly like courseAnalyzer / transcriptParser. */
const normalizeCode = canonicalizeCode;

/** Which elective category (if any) a plan row represents, by its title. */
function electiveCategory(title: string): string | null {
  if (title.includes(ELECTIVE_KEYWORDS.PROFESSIONAL)) return "PROFESSIONAL";
  if (title.includes(ELECTIVE_KEYWORDS.SCIENCE)) return "SCIENCE";
  if (title.includes(ELECTIVE_KEYWORDS.MAJOR)) return "MAJOR";
  if (title.includes(ELECTIVE_KEYWORDS.UNIVERSITY)) return "UNIVERSITY";
  return null;
}

/**
 * Parse a prerequisite code string into concrete course-code prerequisites.
 * Mirrors checkPrerequisites(): "-"/empty => none; "... CR ..." => credit gate
 * (no edge); otherwise comma-separated course codes.
 */
function parsePrereq(prereqCode: string): {
  codes: string[];
  creditReq?: string;
} {
  const raw = (prereqCode || "").trim();
  if (raw === "-" || raw === "") return { codes: [] };

  if (raw.includes("CR")) {
    const match = raw.match(/(\d+)\s*CR/);
    return { codes: [], creditReq: match ? `${match[1]} CR` : raw };
  }

  return {
    codes: raw
      .split(",")
      .map((p) => normalizeCode(p))
      .filter((p) => p.length > 0),
  };
}

/**
 * Assign each node an x/y position using a layered layout where the column is
 * the longest prerequisite chain depth (left = no prereqs, right = deepest).
 * Elective slots are pushed into a trailing column so they don't scatter.
 */
function layout(
  nodes: GraphCourseNode[],
  incoming: Map<string, string[]>
): void {
  const depthCache = new Map<string, number>();
  const inProgress = new Set<string>();

  const depthOf = (id: string): number => {
    if (depthCache.has(id)) return depthCache.get(id)!;
    // Cycle guard for malformed CSV data.
    if (inProgress.has(id)) return 0;
    inProgress.add(id);

    const prereqs = incoming.get(id) ?? [];
    let depth = 0;
    for (const p of prereqs) {
      depth = Math.max(depth, depthOf(p) + 1);
    }

    inProgress.delete(id);
    depthCache.set(id, depth);
    return depth;
  };

  const realNodes = nodes.filter((n) => !n.isElectiveSlot);
  const electiveNodes = nodes.filter((n) => n.isElectiveSlot);

  let maxDepth = 0;
  for (const n of realNodes) {
    const d = depthOf(n.id);
    maxDepth = Math.max(maxDepth, d);
  }

  // Place real nodes column by column.
  const rowByDepth = new Map<number, number>();
  for (const n of realNodes) {
    const d = depthCache.get(n.id) ?? 0;
    const row = rowByDepth.get(d) ?? 0;
    n.position = { x: d * COL_SPACING, y: row * ROW_SPACING };
    rowByDepth.set(d, row + 1);
  }

  // Elective slots stacked in one trailing column.
  const electiveCol = maxDepth + 1;
  electiveNodes.forEach((n, i) => {
    n.position = { x: electiveCol * COL_SPACING, y: i * ROW_SPACING };
  });
}

/**
 * Build the prerequisite graph for a department, colored by the student's
 * status in the given report/transcript.
 */
export async function buildCourseGraph(
  department: Department,
  transcriptData: TranscriptData,
  report: AnalysisReport
): Promise<CourseGraph> {
  const { courses } = await loadDepartmentData(department);

  // Status lookup sets (all normalized).
  const studiedSet = new Set(getStudiedCourseCodes(transcriptData.courses));
  const ungradedSet = new Set(
    report.ungradedCourses.map((c) => normalizeCode(c.code))
  );
  const failedSet = new Set(
    report.withdrawnFailedCourses.map((c) => normalizeCode(c.code))
  );
  const availableSet = new Set(
    report.availableCourses.map((c) => normalizeCode(c.code))
  );

  // How many slots of each elective category the student has satisfied.
  const satisfiedByCategory: Record<string, number> = {
    PROFESSIONAL: report.completedProfessionalTraining.length,
    SCIENCE: report.completedScienceElectives.length,
    MAJOR: report.completedMajorElectives.length,
    UNIVERSITY: report.completedUniversityRequirements.length,
  };
  const usedByCategory: Record<string, number> = {
    PROFESSIONAL: 0,
    SCIENCE: 0,
    MAJOR: 0,
    UNIVERSITY: 0,
  };

  const nodes: GraphCourseNode[] = [];
  const edges: GraphCourseEdge[] = [];
  // normalized code -> node id, for resolving prerequisite edges.
  const codeToId = new Map<string, string>();
  // node id -> list of prerequisite node ids (for layout depth).
  const incoming = new Map<string, string[]>();

  courses.forEach((course, index) => {
    const norm = normalizeCode(course.code);
    const category = electiveCategory(course.title);
    const isElectiveSlot = category !== null;

    // A plan may list the same course under equivalent codes (e.g. the IS plan
    // has both CCS3601 and CAI3101 rows for Intro to AI). After canonicalization
    // they share a code, so render only the first as a single node.
    if (!isElectiveSlot && codeToId.has(norm)) {
      return;
    }

    // Elective placeholders can share/lack codes, so give them unique ids.
    const id = isElectiveSlot ? `elective-${category}-${index}` : norm;

    const { codes: prereqCodes, creditReq } = parsePrereq(
      course.prerequisiteCode
    );

    let status: CourseStatus;
    if (isElectiveSlot) {
      const satisfied = satisfiedByCategory[category!] ?? 0;
      const used = usedByCategory[category!];
      status = used < satisfied ? "completed" : "elective";
      usedByCategory[category!] = used + 1;
    } else if (failedSet.has(norm)) {
      status = "failed";
    } else if (ungradedSet.has(norm)) {
      status = "ungraded";
    } else if (studiedSet.has(norm)) {
      status = "completed";
    } else if (availableSet.has(norm)) {
      status = "available";
    } else {
      status = "blocked";
    }

    nodes.push({
      id,
      code: course.code || (isElectiveSlot ? "Elective" : ""),
      title: course.title,
      status,
      isElectiveSlot,
      creditReq,
      position: { x: 0, y: 0 },
    });

    if (!isElectiveSlot && !codeToId.has(norm)) {
      codeToId.set(norm, id);
    }
    incoming.set(id, prereqCodes as string[]);
  });

  // Resolve prerequisite codes into edges (skip prereqs not in this plan).
  const resolvedIncoming = new Map<string, string[]>();
  for (const [nodeId, prereqCodes] of incoming.entries()) {
    const resolved: string[] = [];
    for (const pc of prereqCodes) {
      const sourceId = codeToId.get(pc);
      if (sourceId && sourceId !== nodeId) {
        resolved.push(sourceId);
        edges.push({
          id: `${sourceId}->${nodeId}`,
          source: sourceId,
          target: nodeId,
        });
      }
    }
    resolvedIncoming.set(nodeId, resolved);
  }

  layout(nodes, resolvedIncoming);

  return { nodes, edges };
}
