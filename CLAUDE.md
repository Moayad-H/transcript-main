# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

ERSHAD2: a Next.js (App Router) academic advising tool for CCIT students. Users upload a PDF transcript, it's parsed entirely client-side, matched against CSV-defined department curricula, and rendered as an advising report (completed/remaining requirements, electives, courses available to register next).

## Commands

```bash
npm run dev      # start dev server (http://localhost:3000)
npm run build    # production build
npm run start    # run production build
npm run lint     # eslint
npx tsc --noEmit -p .   # typecheck (no separate script defined)
```

There is no test suite/script in this repo.

### Docker

```bash
docker compose up --build   # builds and serves via nginx on port 8080
```

Containerization exists specifically to avoid host Node/npm environment issues (see `Dockerfile`, `nginx.conf`, `docker-compose.yml`). If a collaborator hits dependency resolution errors locally, prefer Docker over debugging their global npm state.

## Architecture

### The naming trap: `transcriptParser.ts` vs `clientParser.ts`

Despite the names, **`src/lib/analysis/transcriptParser.ts` is the real, active PDF parser** — it uses `pdfjs-dist` to extract text client-side (dynamically imported, worker loaded from `/pdf.worker.min.mjs` in `public/`) and is called directly from `src/app/page.tsx`. **`src/lib/analysis/clientParser.ts` is a mostly-unused stub** (`parseTranscriptPDF` there just throws); its only live export is `createTranscriptFromManualEntry`, used by `ManualEntryForm.tsx` as a fallback path when PDF parsing fails or a user enters courses by hand.

Both files independently implement near-identical logic — `getStudiedCourseCodes`, `getUngradedCourses`, `getWithdrawnFailedCourses`, `calculateCreditHours`, `calculateUngradedCreditHours`. There are two parallel report generators too: `reportGenerator.ts` (pairs with `transcriptParser.ts`, used by the main upload flow) and `clientReportGenerator.ts` (pairs with `clientParser.ts`, used by the manual-entry flow). **When fixing a bug in one, check the other — they drift.**

### Data flow

1. `FileUpload.tsx` → `page.tsx` reads the PDF into a `Buffer`, calls `parseTranscriptPDF` (`transcriptParser.ts`) → returns `TranscriptData` (student name/id, detected `Department`, `StudiedCourse[]`, remedial course flags).
2. `page.tsx` calls `generateReport(studentName, department, transcriptData)` (`reportGenerator.ts`), which:
   - Loads department CSVs via `csvLoader.ts` (`public/data/courses/{DEPT} Courses.csv`, `public/data/majors/Major {DEPT}.csv`, `public/data/electives/science.csv`, `public/data/electives/university.csv`).
   - Delegates eligibility/requirement logic to `courseAnalyzer.ts` (prerequisite checks, elective matching, out-of-plan detection, professional training).
   - Assembles the flat `AnalysisReport` (`src/types/report.ts`).
3. `ReportDisplay.tsx` renders the `AnalysisReport`; `ReportSection.tsx` is the reusable list renderer for each category. It also holds a `"report" | "graph"` view toggle — the "Course Graph" tab lazy-loads `CourseGraphView.tsx` (via `next/dynamic`), passing both `report` and the raw `transcriptData`.

There is no backend/API route (`src/app` has no subfolders) — everything runs in the browser. `/api/download-report` is referenced in `ReportDisplay.tsx` but falls back to a pure client-side text download (`reportFormatter.ts` + `helpers.ts`) if the fetch fails, since no such route currently exists in the repo.

### Grading and credit-hour rules (`src/lib/constants.ts` `GRADES`)

- `PASSING`: letter grades A+ through D-, plus `P` and `Tr` (transferred) — these count toward `totalCreditHours`.
- `FAILING`: `F`. `WITHDRAWN`: `W`. Both excluded from credit hours; tracked for remedial-course logic (see `logic.md`).
- `UNGRADED`: `U` — course taken, grade not yet posted. **Does not count toward `totalCreditHours`**, but its credit value is surfaced separately via `expectedCreditHours` (`totalCreditHours` + pending `U` credits) so students can see what they'll have once grades post.
- Credit value per course is 3, except codes prefixed `UNR` or `CNC` which are 2. Professional Training courses are excluded from the hour count entirely (subtracted back out via `professionalTrainingCount * 3`), as is Practical Training (`CIT4000`, subtracted by direct code lookup) — see below.

`logic.md` is the source of truth for course-eligibility/display rules (what counts as "available to register," remedial course precedence, elective counting, out-of-plan detection) — read it before touching `courseAnalyzer.ts`.

### Department/curriculum model

Departments are `CS | SE | IS | CY | AI | GM` (`constants.ts`). Each has a course-plan CSV, a major-electives CSV, and shares the two elective CSVs (science, university). Course prefixes map to categories (`COURSE_PREFIXES`): `CCS` (CS core), `EBA` (engineering/math), `UNR` (university), `CIS`/`CAI`/`CCY` (major-specific), `CNC` (entrepreneurship), `CIT` (IT — excluded from out-of-plan warnings per `logic.md`). Elective placeholder rows in the course-plan CSVs are detected by title keyword (`ELECTIVE_KEYWORDS`: "Prof", "Major", "Science El", "University") rather than course code.

Special remedial courses (`SPECIAL_COURSES`) have cross-dependency rules — e.g. Calculus I (`EBA1203`) is blocked while Precalculus (`EBA0201`) remediation is still owed; `UNR1403` is blocked while Remedial English (`GLA0001`) is still owed. This logic lives in `courseAnalyzer.ts`'s remedial handling and is documented in `logic.md`.

### Practical Training (`CIT4000`)

A single, real-coded core course (not a title-keyword placeholder like Professional Training) added to every department's course-plan CSV and to Semester 8 of every `public/data/department_plans/{DEPT}.md`, with `prerequisiteCode = "90 CR. or more"`. It rides the existing generic "N CR" prerequisite gate in `checkPrerequisites()` — no bespoke eligibility code — so it appears in "Courses You Can Register" once the student hits 90 credit hours, and needs no special-casing in `courseGraphBuilder.ts` (it flows through as a normal plan-coded node). `getPracticalTrainingStatus()` (`courseAnalyzer.ts`) reads its completion/ungraded state directly off the transcript by code (`PRACTICAL_TRAINING_CODE` in `constants.ts`), surfaced in `AnalysisReport` as `practicalTrainingCompleted` / `practicalTrainingUngraded` / `practicalTrainingEligible`, plus `practicalTrainingWarning` (true once `totalCreditHours >= GRADUATION_CREDIT_HOURS` (132) and the course still isn't completed — drives the warning banner in `ReportDisplay.tsx`). Pass/fail, so like Professional Training its credits are excluded from `totalCreditHours` — that exclusion is duplicated in both `transcriptParser.ts` and `clientParser.ts` per the naming-trap note above.

### Graduation (132 credit-hour requirement)

Graduation requires `GRADUATION_CREDIT_HOURS` (132, in `constants.ts`) **earned** credit hours *and* every remaining requirement cleared. Both report generators compute three `AnalysisReport` fields (kept in sync per the dual-parser note): `creditHoursToGraduation` (`max(0, 132 - totalCreditHours)`), `graduationCreditRequirementMet` (`totalCreditHours >= 132`), and `graduationEligible` (credit requirement met **and** `remainingMajorElectives`/`remainingScienceElectives`/`remainingUniversityRequirements`/`remainingProfessionalTraining` all `0` **and** `practicalTrainingCompleted` **and** a passing GPA — see Academic probation below). Key subtlety: these use **earned** `totalCreditHours`, not `expectedCreditHours` — pending `U` grades don't graduate a student. `ReportDisplay.tsx` surfaces this as a "To Graduate" header cell plus a top-of-report status banner (green = eligible, blue = 132 met but requirements outstanding, gray = still accumulating); `formatReportAsText` (in both `reportGenerator.ts` and `reportFormatter.ts`) mirrors it in the download/print export. This is distinct from `practicalTrainingWarning`, which fires purely on the 132 threshold regardless of other requirements.

### Academic probation ("half-load")

A student whose **cumulative GPA is below `PROBATION_GPA_THRESHOLD` (2.0)** is on probation. GPA comes from the transcript: `transcriptParser.ts`'s `extractGpaFromText()` (the last printed `G.P.A` value) populates `TranscriptData.gpa`. Both report generators derive `AnalysisReport.onProbation` (`gpa != null && gpa < 2.0`) — a *known* GPA is required, so manual-entry transcripts (no GPA) are never flagged. Constants live in `constants.ts` (`PROBATION_GPA_THRESHOLD`, `PROBATION_HALF_LOAD_CREDITS` = 12, `PROBATION_MAX_SEMESTERS` = 3).

Four enforcement points, all keyed off `onProbation`:

1. **12 Cr half-load in manual planning** (`CourseGraphView.tsx`): while on probation, `handleNodeClick` hard-blocks cycling a course to "Registered" once the running registered-credit total (sum of `ungraded`-status nodes) would exceed 12 Cr, surfacing a transient `capWarning`. A red `Registered: N/12 Cr.` tally shows in manual mode.
2. **Probation banner + semester counter**: `ReportDisplay.tsx` (report view) and `CourseGraphView.tsx` (graph view) both render a red banner. The counter is `probationSemesters` — a **best-effort heuristic** from `extractProbationSemesters()` (`transcriptParser.ts`), which counts how many printed `G.P.A` values fall below 2.0; degrades to no count (0) when unparseable. `probationSemestersExceeded` (≥ 3) drives a dismissal-risk warning.
3. **Project I blocked** (requirement 4): Project I appears under different codes per department (`CCS4901`/`CSE4901`/`CIS4901`/`CCY4901`/`CGM4901`), so it's matched by title via `isProjectOneTitle()` (`constants.ts`) — "Project II" must not match. `getAvailableCourses()` (`courseAnalyzer.ts`, given `gpa`) excludes it from "Courses You Can Register"; `CourseGraphView`'s manual `recompute` also forces its node to `blocked`. Note this is distinct from Practical Training (`CIT4000`), which shares the 90 CR gate but is **not** GPA-gated.
4. **Graduation blocked** (requirement 5): `graduationEligible` additionally requires `gpa === null || gpa >= 2.0` (unknown GPA doesn't block). Both generators + both text formatters (`reportGenerator.ts`, `reportFormatter.ts`) mirror the probation line.

Per the dual-parser note, the `onProbation`/`probationSemesters`/`probationSemestersExceeded` fields and the graduation-GPA gate are duplicated in both `reportGenerator.ts` and `clientReportGenerator.ts`.

### Course-code canonicalization

`canonicalizeCode()` (`constants.ts`) is the single normalization used everywhere two codes are compared — it strips non-alphanumerics, uppercases, and resolves cross-plan equivalences (e.g. `CCS3601` ⇄ `CAI3101`, both "Introduction to AI"). The transcript parser, `courseAnalyzer.ts`, and `courseGraphBuilder.ts` all key off it, so a course taken under one code counts everywhere the equivalent code appears. When adding a code alias, add it to `COURSE_CODE_EQUIVALENCE`, not to individual call sites. `isTwoCreditCourse()` (UNR-prefixed or `CNC1401`) is the shared 2-vs-3 credit rule.

### Course prerequisite graph view

`CourseGraphView.tsx` (React Flow / `@xyflow/react`) renders the department's full course plan as a prerequisite DAG, color-coded by the student's status. The pure, testable node/edge builder is `courseGraphBuilder.ts` (`buildCourseGraph`), which reuses the same canonicalization and prerequisite-parsing rules as the report so the graph never disagrees with it. Node status is derived from the `AnalysisReport` sets (completed/available/ungraded/failed) plus per-category elective-slot counting; edges come from parsing each course's `prerequisiteCode` (a `"… CR"` prerequisite is a credit-hour gate, rendered as a badge with no edge rather than an edge).

Elective placeholder slots fill by category in priority order: **completed** slots first (`report.completed{Science,Major,University}Electives`), then **ungraded/registered** slots (`report.ungraded{Science,Major,University}Electives` — a course taken with a `U` grade that matches an elective CSV, e.g. Advanced Physics/Biochemistry as a Science Elective), then remaining slots stay empty `"elective"` placeholders. The `ungraded*Electives` fields are produced by `getUngradedElectives()` (`courseAnalyzer.ts`, the `U`-grade mirror of `getCompletedElectives()`) and, per the dual-parser note, are computed in **both** `reportGenerator.ts` and `clientReportGenerator.ts`. (Professional Training has no separate ungraded field — `getProfessionalTraining()` already treats `U` as satisfied.)

**Layout is driven by the study plans in `public/data/department_plans/{DEPT}.md`** — one markdown table per semester (1–8). `loadPlanSemesters()` parses these into a code→semester map plus per-category elective-slot queues; `layoutBySemester()` then makes each column a semester. If a plan file is missing/unparseable, it falls back to `layoutByDepth()` (columns = longest prerequisite-chain depth). Plan codes carry footnote noise the parser strips (leading `1`/`2` reference numbers, trailing `*`, embedded spaces) before canonicalizing to match the CSVs.

The view has two interactive modes layered over the base graph (styling is recomputed via `useMemo`, never by rebuilding the graph): **Manual planning** (click a node to cycle Auto → Registered → Finished → Not taken; availability and the live achieved-credit-hour tally recompute downstream from prerequisites and credit gates) and a **GPA calculator** (project hypothetical grades onto registered/ungraded courses; grade points use the CCIT scale in `CourseGraphView.tsx`, distinct from `constants.ts` `GRADES`). Clicking a node outside manual mode highlights its full transitive prerequisite chain.
