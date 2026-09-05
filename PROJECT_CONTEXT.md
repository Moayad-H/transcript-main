# PROJECT_CONTEXT — ERSHAD2

> Comprehensive context for future sessions. Companion to `CLAUDE.md` (agent instructions) and `logic.md` (course-eligibility rules, the source of truth for `courseAnalyzer.ts`). Last updated 2026-09-05.

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

### Course recommendation priority (`splitAvailableCourses`)

Available courses are split into **Section A (Recommended Semester Schedule)** and **Section B (Other Eligible Core Courses)** using a 4-tier prerequisite- and credit-aware ranking:
1. **Tier 1**: 3-credit courses that unlock downstream courses (prerequisite chain).
2. **Tier 2**: 3-credit core / science courses without downstream dependents.
3. **Tier 3**: 2-credit courses that unlock downstream courses (e.g. `UNR1403`).
4. **Tier 4**: 2-credit terminal courses with 0 downstream dependents (e.g. `CNC1401` Entrepreneurship Skills, `UNR1302`, `UNR2101`, `UNR1407`, `UNR4201`).

Within each tier, courses sort by:
- Study plan semester (`semesterOf`, earliest first),
- Downstream unlock count (`countDownstreamDependents`),
- Core before elective,
- Plan reading order.

**Rationale**: Courses like `CNC1401` (Entrepreneurship Skills) appear in Semester 2 of the plan, have 0 downstream dependents, and earn 2 credits. Deprioritizing them to Tier 4 ensures they never displace vital 3 CR core/prerequisite courses from Section A or leave awkward load remainders (e.g. 14 of 15 Cr). They remain available in Section B or are recommended when free capacity allows.

### Recommendation reasoning (`CourseRecommendationReason`)

Each recommended course is enriched with a `recommendationReason` object generated in `splitAvailableCourses`:
- `summary`: Plain-language explanation for why the course is recommended.
- `planSemester`: Curricular plan semester.
- `unlocksCount` & `unlockedCourses`: Specific downstream courses unlocked by passing this course (`{ code, title }[]`).
- `priorityTier`: Priority tier (1–4).
- `isOverdue`: Flagged when an earlier semester's course is still outstanding.
- `loadConstraint`: Academic standing cap note (e.g. "Fits within upper-years 15 Cr load cap").

In the UI, `CourseRow.tsx` provides an interactive **"💡 Why?"** badge that expands to display the detailed breakdown and list of unlocked courses.

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

- **`Course`** `{ code, title, prerequisiteCode, prerequisiteTitle?, recommendationReason? }`
- **`CourseRecommendationReason`** `{ summary, planSemester?, unlocksCount?, unlockedCourses?, priorityTier?, isOverdue?, loadConstraint? }`
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
  RemoteBanner.tsx (222)      Edge Config broadcast announcement banner
  report/                     NextSemesterHero, CourseRow, StudentBar, AcademicAuditCard, etc.

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

- **v0.6.2: Recommendation Reasoning, 4-Tier Scheduling Algorithm & Remote Banner**
  - **Course Recommendation Reasoning (`CourseRecommendationReason`)**: Enhanced `splitAvailableCourses` and `CourseRow.tsx` with contextual recommendation explanations (`summary`, `priorityTier`, `planSemester`, `isOverdue`, `loadConstraint`, and `unlockedCourses` downstream chain). Surfaced via interactive expandable "💡 Why?" pills in `CourseRow.tsx` and summary badge in `NextSemesterHero.tsx`.
  - **4-Tier Priority & 2-Credit Terminal Deprioritization**: Refined recommendation algorithm with `countDownstreamDependents` and 4 tiers (Tier 1: 3 CR prereq chain; Tier 2: 3 CR standalone core/science; Tier 3: 2 CR prereq chain e.g. `UNR1403`; Tier 4: 2 CR terminal with 0 dependents e.g. `CNC1401` Entrepreneurship Skills and standalone UNR requirements). Prevents low-credit terminal courses from prematurely filling semester capacity or displacing critical 3 CR prerequisites.
  - **Remote Announcement Banner (`RemoteBanner.tsx`)**: Broadcast banner integration powered by Vercel Edge Config (`NEXT_PUBLIC_EDGE_CONFIG_BANNER_URL`) with local storage dismissal tracking and severity styling (info, warning, danger, success).
  - **Analytics & Color Polish**: Integrated `@vercel/analytics/next` and polished status indicator colors across graph and report views.
- **v0.6.0: Revamped Advising Report Hub & 2-Zone Cockpit** — redesigned report to prioritize Next-Semester Registration Hub (`NextSemesterHero.tsx`) with live credit tallying, packaged Core + interactive unselected Major Elective slots + Professional Training slots, prominent in-progress course view, interactive department switcher in `StudentBar`, and tabbed `AcademicAuditCard.tsx`.
- **fix prof. training categorization** (`7ee20e1`)
- **graph view matches department plans** — semester-based layout from `department_plans/*.md` (`398f918`)
- **GPA calculator + future credit achieved** in graph view (`308a80f`)
- **Manual department choice; fix AI/CCS3601⇄CAI3101 conflict** via canonicalization (`47327d2`)
- **Graph view added** (React Flow), interactive prereq-chain highlighting (`148e262`, PR #1)
- **Expected Credit Hours** feature — `expectedCreditHours` on report (`ed13a17`)
- **Fix: ungraded `U` courses wrongly counted toward achieved credit** — fixed in BOTH parsers (`f9efa2a`)
- **Containerize** (Docker + nginx) to escape host npm/Tailwind dependency conflict (`264520b`)
- UNR/CNC 2-credit handling; `Tr` transferred + show failed/withdrawn courses.

---

## 10. Gotchas / when-you-touch-X-also-touch-Y

- **Two parsers + two report generators + two `formatReportAsText`** drift — fix bugs on both sides (upload path AND manual-entry path). When calling `splitAvailableCourses()`, pass `coursePlan` in both `reportGenerator.ts` and `clientReportGenerator.ts`.
- **Code comparison** → always `canonicalizeCode()`; add aliases only to `COURSE_CODE_EQUIVALENCE`.
- **2-credit courses** → `isTwoCreditCourse()`, don't hardcode.
- **Graph must agree with report** → `courseGraphBuilder.ts` reuses report sets + canonicalization; don't fork prereq logic.
- **Eligibility/remedial/out-of-plan/elective-counting rules** → read `logic.md` first; it governs `courseAnalyzer.ts`.
- **Ungraded `U`** → excluded from `totalCreditHours`, surfaced only via `expectedCreditHours`.
- **No API route** → download falls back to client-side text; don't assume a server.
- **Env issues** → use Docker rather than debugging global npm.
