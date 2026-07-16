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

/** A layout column header (e.g. a semester), for rendering above its column. */
export interface GraphColumn {
  x: number;
  label: string;
}

export interface CourseGraph {
  nodes: GraphCourseNode[];
  edges: GraphCourseEdge[];
  columns: GraphColumn[];
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
 * The official department study plan, parsed from
 * `public/data/department_plans/{DEPT}.md`. It tells us which semester (1..8)
 * each course belongs to, so the graph columns follow the real curriculum
 * sequence instead of a derived prerequisite depth.
 */
interface PlanSemesters {
  /** canonical course code -> semester number (real, coded courses). */
  codeToSemester: Map<string, number>;
  /** category -> semesters of its placeholder rows, in plan reading order. */
  electiveQueues: Record<string, number[]>;
  /** Highest semester seen (for placing unmatched nodes in a trailing column). */
  maxSemester: number;
}

/**
 * Strip footnote markers a plan may attach to a code (a leading "1"/"2"
 * reference number or a trailing "*") before canonicalizing. Plan codes like
 * "1EBA0201", "2GLA0001", or "EBA 2204" then line up with the CSV/transcript.
 */
function planCodeToCanonical(rawCode: string): string {
  return normalizeCode(rawCode.replace(/^\s*\d+/, "").replace(/\*/g, ""));
}

/**
 * Fetch and parse a department's markdown study plan into semester assignments.
 * Returns null if the plan can't be loaded, so the caller can fall back to the
 * prerequisite-depth layout.
 */
async function loadPlanSemesters(
  department: Department
): Promise<PlanSemesters | null> {
  let text: string;
  try {
    const res = await fetch(`/data/department_plans/${department}.md`);
    if (!res.ok) return null;
    text = await res.text();
  } catch {
    return null;
  }

  const codeToSemester = new Map<string, number>();
  const electiveQueues: Record<string, number[]> = {
    PROFESSIONAL: [],
    SCIENCE: [],
    MAJOR: [],
    UNIVERSITY: [],
  };
  let currentSemester = 0;
  let maxSemester = 0;

  for (const line of text.split(/\r?\n/)) {
    const semHeader = line.match(/^#+\s*Semester\s+(\d+)/i);
    if (semHeader) {
      currentSemester = parseInt(semHeader[1], 10);
      maxSemester = Math.max(maxSemester, currentSemester);
      continue;
    }
    // Table rows only ("| code | title |"); skip the header/separator rows.
    if (!line.trimStart().startsWith("|") || currentSemester === 0) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length < 2) continue;
    const [rawCode, title] = cells;
    if (!rawCode || /course\s*code/i.test(rawCode) || /^-+$/.test(rawCode)) {
      continue;
    }

    const category = electiveCategory(title);
    if (category) {
      electiveQueues[category].push(currentSemester);
    } else {
      const canon = planCodeToCanonical(rawCode);
      if (canon && !codeToSemester.has(canon)) {
        codeToSemester.set(canon, currentSemester);
      }
    }
  }

  if (codeToSemester.size === 0) return null;
  return { codeToSemester, electiveQueues, maxSemester };
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
 * Assign x/y positions from the study plan: each column is a semester (1..8),
 * and nodes stack top-to-bottom within their semester's column. Unmatched
 * nodes are grouped in a trailing column so they don't scatter.
 */
function layoutBySemester(
  nodes: GraphCourseNode[],
  nodeSemester: Map<string, number>,
  maxSemester: number
): GraphColumn[] {
  // Column for anything the plan didn't place (one past the last semester).
  const fallbackCol = maxSemester; // semesters are 1-based -> columns 0..max-1
  const rowByCol = new Map<number, number>();
  for (const n of nodes) {
    const sem = nodeSemester.get(n.id);
    const col = sem ? sem - 1 : fallbackCol;
    const row = rowByCol.get(col) ?? 0;
    n.position = { x: col * COL_SPACING, y: row * ROW_SPACING };
    rowByCol.set(col, row + 1);
  }

  // One header per column that actually has nodes.
  return [...rowByCol.keys()]
    .sort((a, b) => a - b)
    .map((col) => ({
      x: col * COL_SPACING,
      label: col === fallbackCol ? "Other" : `Term ${col + 1}`,
    }));
}

/**
 * Fallback layout (no study plan available): a layered layout where the column
 * is the longest prerequisite chain depth (left = no prereqs, right = deepest).
 * Elective slots are pushed into a trailing column so they don't scatter.
 */
function layoutByDepth(
  nodes: GraphCourseNode[],
  incoming: Map<string, string[]>
): GraphColumn[] {
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

  // Depth columns aren't semesters, so they get no "Term" headers.
  return [];
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
  const [{ courses }, plan] = await Promise.all([
    loadDepartmentData(department),
    loadPlanSemesters(department),
  ]);

  // Running cursor into each category's plan-semester queue, so the Nth
  // elective slot of a category maps to the Nth placeholder in the plan.
  const electiveQueueIdx: Record<string, number> = {
    PROFESSIONAL: 0,
    SCIENCE: 0,
    MAJOR: 0,
    UNIVERSITY: 0,
  };
  // node id -> semester number, from the study plan (for the column layout).
  const nodeSemester = new Map<string, number>();

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

    // Semester (study-plan column) for this node: coded courses by canonical
    // code; elective/professional slots by consuming their category's queue.
    if (plan) {
      let semester = plan.codeToSemester.get(norm);
      if (semester === undefined && isElectiveSlot) {
        const queue = plan.electiveQueues[category!] ?? [];
        semester = queue[electiveQueueIdx[category!]++];
      }
      if (semester !== undefined) nodeSemester.set(id, semester);
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

  // Position by study-plan semesters when available; otherwise fall back to the
  // derived prerequisite-depth layout.
  const columns =
    plan && nodeSemester.size > 0
      ? layoutBySemester(nodes, nodeSemester, plan.maxSemester)
      : layoutByDepth(nodes, resolvedIncoming);

  return { nodes, edges, columns };
}
