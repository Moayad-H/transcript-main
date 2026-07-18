# PROJECT_CONTEXT — ERSHAD2

> Comprehensive context for future sessions. Companion to `CLAUDE.md` (agent instructions) and `logic.md` (course-eligibility rules, the source of truth for `courseAnalyzer.ts`). Last updated 2026-07-16.

---

## 1. What this is

**ERSHAD2** — a Next.js (App Router) academic-advising tool for CCIT (College of Computing and Information Technology, Cairo) students. A student uploads a **PDF transcript**; it is parsed **entirely client-side** (no backend), matched against **CSV-defined department curricula**, and rendered as an advising report: completed vs. remaining requirements, electives, and courses available to register next. A **prerequisite graph view** visualizes the whole department plan color-coded by the student's status, with **manual planning** and **GPA-calculator** modes.

- **No backend / no API routes.** `src/app` has no subfolders. Everything runs in the browser. `/api/download-report` is referenced in `ReportDisplay.tsx` but falls back to a pure client-side text download when the fetch fails (no such route exists).
- Deployed as a **static export** (`next build` → `out/`), served via **nginx in Docker** on port 8080. Containerization exists to dodge host Node/npm dependency-resolution issues (a Tailwind conflict was traced to a stray `package.json` in the home dir). Prefer Docker over debugging a collaborator's global npm state.

## 2. Tech stack

- **Next.js 16.1.1** (App Router), **React 19.2**, **TypeScript 5**
- **Tailwind CSS v4** (`@tailwindcss/postcss`)
- **pdfjs-dist ^5.4** — client-side PDF text extraction (worker from `public/pdf.worker.min.mjs`, dynamically imported)
- **papaparse** — CSV parsing
- **@xyflow/react (React Flow) ^12** — prerequisite graph
- Also present: react-hook-form + zod + @hookform/resolvers, react-dropzone, zustand, clsx, tailwind-merge. (`pdf-parse` is a dependency but the active parser is `pdfjs-dist`.)

## 3. Commands

```bash
npm run dev              # dev server http://localhost:3000
npm run build            # production build (static export → out/)
npm run start            # run production build
npm run lint             # eslint
npx tsc --noEmit -p .    # typecheck (no dedicated script)
docker compose up --build  # build + serve via nginx on :8080
```

There is **no test suite** in this repo. Verification = `tsc --noEmit` + `npm run lint` + manual build.

---

## 4. Architecture

### 4.1 The naming trap — TWO parallel parsers/generators that DRIFT

Despite the names:

- **`src/lib/analysis/transcriptParser.ts` is the REAL, active PDF parser** (uses pdfjs-dist, called from `page.tsx`).
- **`src/lib/analysis/clientParser.ts` is a mostly-unused stub** — its `parseTranscriptPDF` just throws. Only live export: `createTranscriptFromManualEntry`, used by `ManualEntryForm.tsx` as a fallback when PDF parsing fails / user enters courses by hand.

Two parallel **report generators** too:
- `reportGenerator.ts` ↔ pairs with `transcriptParser.ts` — **main upload flow**.
- `clientReportGenerator.ts` ↔ pairs with `clientParser.ts` — **manual-entry flow**.

Both pairs independently reimplement near-identical helpers: `getStudiedCourseCodes`, `getUngradedCourses`, `getWithdrawnFailedCourses`, `calculateCreditHours`, `calculateUngradedCreditHours`. **When you fix a bug in one, check/fix the other — they drift.** (The "U counts as credit" bug had to be fixed in BOTH.)

Similarly there are two text formatters with the same function name `formatReportAsText`: one in `reportGenerator.ts` and one in `src/lib/utils/reportFormatter.ts` (client-safe). Keep them in sync.

### 4.2 Data flow (main upload path)

1. **`FileUpload.tsx` → `page.tsx`** reads the PDF into a Buffer, calls `parseTranscriptPDF` (`transcriptParser.ts`) → returns `TranscriptData` (student name/id, detected `Department`, `StudiedCourse[]`, remedial flags, gpa).
2. **`page.tsx` → `generateReport(studentName, department, transcriptData)`** (`reportGenerator.ts`):
   - Loads department CSVs via `csvLoader.ts`.
   - Delegates eligibility/requirement logic to **`courseAnalyzer.ts`** (prereq checks, elective matching, out-of-plan detection, professional training).
   - Assembles the flat **`AnalysisReport`** (`src/types/report.ts`).
3. **`ReportDisplay.tsx`** renders the report; **`ReportSection.tsx`** is the reusable list renderer per category. It holds a `"report" | "graph"` view toggle — the **Course Graph** tab lazy-loads `CourseGraphView.tsx` (`next/dynamic`), passing both `report` and raw `transcriptData`.

Manual department choice is supported (user can override the auto-detected department — commit "Manual Department choice, fix AI conflict").

### 4.3 CSV "database" — `public/data/`

| Folder | Contents |
|---|---|
| `courses/{DEPT} Courses.csv` | Full course plan per dept (code, title, prerequisite). Elective **placeholder rows** detected by title keyword, not code. |
| `majors/Major {DEPT}.csv` | Major-elective options per dept. |
| `electives/science.csv`, `electives/university.csv` | Shared across all depts. |
| `department_plans/{DEPT}.md` | Per-semester study plan (markdown tables, semesters 1–8) — **drives graph column layout.** |

Departments: **CS, SE, IS, CY, AI, GM** (`GM` = Mulitmedia). Note: no `Major GM.csv` currently exists.

---

## 5. Domain rules (grading, credit hours, courses)

Defined in `src/lib/constants.ts` (`GRADES`). **`logic.md` is the source of truth** for eligibility/display — read it before touching `courseAnalyzer.ts`.

- **PASSING**: A+…D-, plus `P` and `Tr` (transferred). Count toward `totalCreditHours`.
- **FAILING** `F`, **WITHDRAWN** `W`: excluded from credit hours; tracked for remedial logic and surfaced in `withdrawnFailedCourses`.
- **UNGRADED** `U`: course taken, grade not yet posted. **Does NOT count toward `totalCreditHours`** (this was a real bug — U was wrongly counting; fixed in both parsers). Its credit is surfaced via **`expectedCreditHours`** = `totalCreditHours` + pending U credits, so students see projected total once grades post.
- **Credit value**: 3 per course, **except** 2-credit courses: any `UNR`-prefixed course (University Requirements) **or** `CNC1401` (Entrepreneurship Skills). Shared rule: `isTwoCreditCourse(code)`. Other `CNC` courses are standard 3-credit.
- **Professional Training** courses are excluded from the hour count entirely (subtracted back out via `professionalTrainingCount * 3`).

### Course-code canonicalization — critical

`canonicalizeCode()` (`constants.ts`) is the **single normalization** used everywhere two codes are compared: strips non-alphanumerics, uppercases, resolves cross-plan equivalences. Currently `CCS3601 ⇄ CAI3101` (both "Introduction to AI"). Used by the parser, `courseAnalyzer.ts`, and `courseGraphBuilder.ts` so a course taken under one code counts wherever the equivalent appears. **Add new aliases to `COURSE_CODE_EQUIVALENCE`, never to individual call sites.**

### Prefix → category map (`COURSE_PREFIXES`)

`CCS` CS core · `EBA` engineering/math · `UNR` university · `CIS`/`CAI`/`CCY` major-specific (IS/AI/CY) · `CNC` entrepreneurship · `CIT` IT (**excluded from out-of-plan warnings** per logic.md). Elective placeholder rows detected via `ELECTIVE_KEYWORDS` (`Prof`, `Major`, `Science El`, `University`).

### Special remedial courses (`SPECIAL_COURSES`) — cross-dependency gates

- `EBA1203` **Calculus I** blocked while `EBA0201` **Precalculus** remediation still owed.
- `UNR1403` **Academic English** blocked while `GLA0001` **Remedial English** still owed.

Handled in `courseAnalyzer.ts` remedial logic; documented in `logic.md`.

---

## 6. Course prerequisite graph view

`CourseGraphView.tsx` (React Flow) renders the department's full plan as a prerequisite DAG, color-coded by student status. Pure builder = **`courseGraphBuilder.ts`** (`buildCourseGraph`), which reuses the same canonicalization + prereq parsing as the report so **graph never disagrees with report**. Node status derives from `AnalysisReport` sets (completed/available/ungraded/failed) + per-category elective-slot counting. Edges come from parsing each course's `prerequisiteCode`; a `"… CR"` prerequisite is a **credit-hour gate**, rendered as a badge with no edge.

**Layout** is driven by `public/data/department_plans/{DEPT}.md` — one markdown table per semester. `loadPlanSemesters()` parses these into a code→semester map + per-category elective-slot queues; `layoutBySemester()` makes each column a semester. Missing/unparseable plan → fallback `layoutByDepth()` (columns = longest prereq-chain depth). Plan codes carry footnote noise (leading `1`/`2` refs, trailing `*`, embedded spaces) stripped before canonicalizing.

Two interactive modes layered over the base graph (styling recomputed via `useMemo`, graph never rebuilt):
- **Manual planning** — click a node to cycle Auto → Registered → Finished → Not taken; availability + live achieved-credit tally recompute downstream from prereqs and credit gates.
- **GPA calculator** — project hypothetical grades onto registered/ungraded courses. Grade-point scale (CCIT) lives **inside `CourseGraphView.tsx`**, distinct from `constants.ts` `GRADES`.

Outside manual mode, clicking a node highlights its full transitive prerequisite chain (DFS/stack with visited set; blue ring = selected, amber rings = prereqs, ~25% opacity = unrelated).

---

## 7. Key types (`src/types/`)

- **`Course`** `{ code, title, prerequisiteCode, prerequisiteTitle? }`
- **`StudiedCourse`** `{ code, title, grade }`
- **`ElectiveCourse`** `{ code, title, prerequisiteCode }`
- **`CoursePlan`** `{ courses, majorElectives, scienceElectives, universityElectives }`
- **`TranscriptData`** `{ studentName, studentId, department, courses, remedialCourses, gpa? }`
- **`AnalysisReport`** (flat) — the render contract. Notable fields: `ungradedCourses`, `withdrawnFailedCourses`, `availableCourses`, completed/remaining × (major/science/university/professional), `outOfPlanCourses`, `totalCreditHours`, **`expectedCreditHours`**, `completedCourses`, `gpa`.
- `Department = "CS" | "SE" | "IS" | "CY" | "AI" | "GM"`.

---

## 8. File map (line counts approximate)

```
src/app/page.tsx              main orchestrator (upload → parse → report → display)
src/app/layout.tsx, globals.css

src/components/
  FileUpload.tsx (177)        dropzone + kicks off parsing
  StudentForm.tsx (98)        name / dept entry
  ManualEntryForm.tsx (132)   manual course entry fallback → clientParser
  ReportDisplay.tsx (410)     report/graph toggle, download
  ReportSection.tsx (48)      reusable category list
  CourseGraphView.tsx (697)   React Flow graph + manual + GPA modes
  Header.tsx (12)

src/lib/analysis/
  transcriptParser.ts (350)   *** ACTIVE PDF parser (pdfjs-dist) ***
  reportGenerator.ts (284)    *** main report generator ***
  courseAnalyzer.ts (268)     eligibility/requirement logic (see logic.md)
  courseGraphBuilder.ts (421) pure graph node/edge builder
  clientParser.ts (153)       STUB (throws) + createTranscriptFromManualEntry
  clientReportGenerator.ts (128)  manual-entry report generator

src/lib/data/  csvLoader.ts, clientCsvLoader.ts   (fetch+parse public/data CSVs)
src/lib/utils/ reportFormatter.ts, helpers.ts, fileValidation.ts
src/lib/constants.ts (99)     departments, grades, prefixes, canonicalizeCode, credit rules
src/types/     course.ts, report.ts, transcript.ts, index.ts
```

Infra: `Dockerfile` (multi-stage), `nginx.conf`, `docker-compose.yml`, `next.config.ts` (static export).

---

## 9. Recent work & history (most recent first)

- **fix prof. training categorization** (`7ee20e1`)
- **graph view matches department plans** — semester-based layout from `department_plans/*.md` (`398f918`)
- **GPA calculator + future credit achieved** in graph view (`308a80f`)
- **Manual department choice; fix AI/CCS3601⇄CAI3101 conflict** via canonicalization (`47327d2`)
- **Graph view added** (React Flow), interactive prereq-chain highlighting (`148e262`, PR #1)
- **Expected Credit Hours** feature — `expectedCreditHours` on report (`ed13a17`)
- **Fix: ungraded `U` courses wrongly counted toward achieved credit** — fixed in BOTH parsers (`f9efa2a`)
- **Containerize** (Docker + nginx) to escape host npm/Tailwind dependency conflict (`264520b`)
- UNR/CNC 2-credit handling; `Tr` transferred + show failed/withdrawn courses.

### Uncommitted at last update (working tree)
Cosmetic footer/copyright edits only: "Copyright 2024 Eng. Moheeb" → "2026 Dr. Moheeb", add "- Cairo", in `page.tsx`, `reportGenerator.ts`, `reportFormatter.ts`.

---

## 10. Gotchas / when-you-touch-X-also-touch-Y

- **Two parsers + two report generators + two `formatReportAsText`** drift — fix bugs on both sides (upload path AND manual-entry path).
- **Code comparison** → always `canonicalizeCode()`; add aliases only to `COURSE_CODE_EQUIVALENCE`.
- **2-credit courses** → `isTwoCreditCourse()`, don't hardcode.
- **Graph must agree with report** → `courseGraphBuilder.ts` reuses report sets + canonicalization; don't fork prereq logic.
- **Eligibility/remedial/out-of-plan/elective-counting rules** → read `logic.md` first; it governs `courseAnalyzer.ts`.
- **Ungraded `U`** → excluded from `totalCreditHours`, surfaced only via `expectedCreditHours`.
- **No API route** → download falls back to client-side text; don't assume a server.
- **Env issues** → use Docker rather than debugging global npm.
