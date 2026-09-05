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
2. `page.tsx` calls `generateReport(studentID, studentName, department, transcriptData)` (`reportGenerator.ts`), which:
   - Loads department CSVs via `csvLoader.ts` (`public/data/courses/{DEPT} Courses.csv`, `public/data/majors/Major {DEPT}.csv`, `public/data/electives/science.csv`, `public/data/electives/university.csv`).
   - Delegates eligibility/requirement logic to `courseAnalyzer.ts` (prerequisite checks, elective matching, out-of-plan detection, professional training).
   - Assembles the flat `AnalysisReport` (`src/types/report.ts`).
3. `ReportDisplay.tsx` renders the `AnalysisReport` as the cockpit dashboard (see below) and holds the `"report" | "graph"` view toggle — the "Course Graph" tab lazy-loads `CourseGraphView.tsx` (via `next/dynamic`), passing both `report` and the raw `transcriptData`. Changing department via `StudentBar` triggers `handleDepartmentChange` in `page.tsx` which re-runs `generateReport` and updates the whole report and graph dynamically.

There is no backend/API route (`src/app` has no subfolders) — everything runs in the browser. `/api/download-report` is referenced in `ReportDisplay.tsx` but falls back to a pure client-side text download (`reportFormatter.ts` + `helpers.ts`) if the fetch fails, since no such route currently exists in the repo.

### Grading and credit-hour rules (`src/lib/constants.ts` `GRADES`)

- `PASSING`: letter grades A+ through D-, plus `P` and `Tr` (transferred) — these count toward `totalCreditHours`.
- `FAILING`: `F`. `WITHDRAWN`: `W`. Both excluded from credit hours; tracked for remedial-course logic (see `logic.md`).
- `UNGRADED`: `U` — course taken, grade not yet posted. **Does not count toward `totalCreditHours`**, but its credit value is surfaced separately via `expectedCreditHours` (`totalCreditHours` + pending `U` credits) so students can see what they'll have once grades post.
- Credit value per course is 3, except codes prefixed `UNR` or `CNC1401` which are 2 (computed via `getCourseCredits(code)` / `isTwoCreditCourse(code)` in `constants.ts`). Remedial courses (Precalculus, Remedial English), Professional Training, and Practical Training (`CIT4000`) earn 0 degree credits.
- **Course recommendation ranking (`splitAvailableCourses`)**: Splits eligible courses into Group A (Section A: Recommended Schedule) and Group B (Section B: Other Eligible Core Courses) using a 4-tier priority system: Tier 1 (3 CR prerequisite chain courses), Tier 2 (3 CR core/science courses without dependents), Tier 3 (2 CR prerequisite courses, e.g. `UNR1403`), and Tier 4 (2 CR terminal courses with 0 dependents, like `CNC1401` and standalone UNR courses). This guarantees that 2 CR non-prerequisite courses like `CNC1401` never displace 3 CR core courses or disrupt standard credit caps.

`logic.md` is the source of truth for course-eligibility/display rules (what counts as "available to register," remedial course precedence, elective counting, out-of-plan detection) — read it before touching `courseAnalyzer.ts`.

### The report UI: the cockpit board

The report is a **fixed-height dashboard, not a scrolling document** — the advising complaint it answers is "something important was below the fold". On screens ≥ 1280px the document itself does not scroll: `ReportDisplay.tsx` adds `body.cockpit-lock` (`globals.css` — `height: 100dvh; overflow: hidden`, released on unmount and disabled in `@media print`) and the board fills exactly one viewport. **Long lists scroll inside their own card**, never the page. Below 1280px the grid collapses to one column and the page scrolls normally; the lock class does nothing there.

The report uses an **asymmetric 2-Zone Layout** on desktop (≥ 1280px):
- **Primary Action Zone (~60% left stage)**: Dedicated to the **Next-Semester Registration Hub** (`NextSemesterHero.tsx`), providing an immediate, actionable answer to what courses the student should take next semester.
- **Degree Audit & Diagnostics Zone (~40% right stage)**: Houses **Degree Requirements** (`RequirementsCard.tsx`) and **Academic Health & Audit** (`AcademicAuditCard.tsx`).

Pieces live in `src/components/report/`:

- `NextSemesterHero.tsx` — the centerpiece Next-Semester Registration Hub:
  - **Standing & Load Verdict Banner**: Displays student level (`Year 1–4`), department plan, max allowed credit cap (12 Cr probation half-load, 15 Cr upper-years normal, 18 Cr lower-years normal, or 21 Cr overload for GPA $\ge 3.0$), and active probation alerts (without redundant "Good standing" noise).
  - **In-Progress Courses (Current Term)**: Prominently highlights all active, ungraded (`U`) courses currently enrolled with credit weights, term labels, and total pending credits (`+N Cr. Pending`).
  - **Live Registration Basket & Progress Meter**: Real-time progress bar tracking selected credits against the semester cap with over-capacity warnings and a 1-click Reset button.
  - **Packaged Recommended Schedule (Section A)**: Combines pre-selected Priority Core courses, interactive **Major Elective Slots** (unselected by default for advisor choice with duplicate prevention), and an interactive **Professional Training Slot** (Semesters 5–8) into one unified schedule.
  - **Collapsible Reference Pools (Sections B–F)**: Other Eligible Core, Full Major Electives Pool, Full Professional Training Pool, Science Electives, and University Requirements for exploration.
  - **Guided Advisor Checklist**: Collapsible 4-step workflow guide.
- `DashCard.tsx` — the card primitive (header with tone dot + count badge + optional `actions` slot; body scrolls). `CardTone` is the shared semantic palette: red = wrong, amber = attention, green = done. `CardEmpty` is the empty state.
- `CourseRow.tsx` — dense course row with explicit credit pills (`3 Cr`, `2 Cr`, `0 Cr`), context badges (`Priority Core`, `Major Elective`, `Training`, `Retake Option`, `U · In Progress`), an expandable **"💡 Why?"** recommendation rationale button (detailing plan semester, overdue status, priority tier, and unlocked downstream courses), interactive checkboxes with live basket sync, and subtext notes.
- `StudentBar.tsx` — the always-visible navy identity/stat row with student details, live stats (GPA, Credit Hours, In Progress, Expected, To Graduate, Completed), Print/Download/New Analysis, view toggle (Report vs Course Graph), and an **interactive Department Selector** allowing advisors to switch the student's department plan on the fly and trigger dynamic report recalculation.
- `AcademicAuditCard.tsx` — tabbed diagnostics container combining *Retakes & Failed* (weak D/D+ grades and W/F records), *In-Progress & Other* (Ungraded `U` subjects and out-of-plan courses), and *AI Advisor Notes*.
- `AlertStrip.tsx` — status chips under the student bar (probation, graduation, CIT4000 warning, extra electives, withdrawn/failed, in-progress, retakes, out-of-plan); clicking a chip expands full banner text. Print renders all details expanded.
- `RequirementsCard.tsx` — the three elective categories (solid bar = passed, lighter = ungraded/registered) plus Professional and Practical Training on one card.
- `AiNotesCard.tsx` — the AI advisor notes, with the Generate button and quota counter in the card header so the action is never below the card's own fold.

Card heights: `CARD` gives each card an equal share of its column; `stacked(count)` collapses an **empty** card to its header so its sibling gets the height. Everything carries `print:` overrides (grid → block, bodies → `overflow-visible`) so printing produces a clean, linear document.

### Department/curriculum model

Departments are `CS | SE | IS | CY | AI | GM | PSCS` (`constants.ts`). Each has a course-plan CSV, a major-electives CSV, and shares the two elective CSVs (science, university). `PSCS` ("Preparation of Science - Computer Science / Cairo") is a Cairo-track variant with its own remedial structure — mandatory Precalculus and Biochemistry in the first semester, gating Physics and Calculus I behind Precalculus completion — so remedial handling in `courseAnalyzer.ts` is department-aware (the department is threaded into the eligibility calls). Course prefixes map to categories (`COURSE_PREFIXES`): `CCS` (CS core), `EBA` (engineering/math), `UNR` (university), `CIS`/`CAI`/`CCY` (major-specific), `CNC` (entrepreneurship), `CIT` (IT — excluded from out-of-plan warnings per `logic.md`). Elective placeholder rows in the course-plan CSVs are detected by title keyword (`ELECTIVE_KEYWORDS`: "Prof", "Major", "Science El", "University") rather than course code.

Special remedial courses (`SPECIAL_COURSES`) have cross-dependency rules — e.g. Calculus I (`EBA1203`) is blocked while Precalculus (`EBA0201`) remediation is still owed; `UNR1403` is blocked while Remedial English (`GLA0001`) is still owed. This logic lives in `courseAnalyzer.ts`'s remedial handling and is documented in `logic.md`.

### Practical Training (`CIT4000`)

A single, real-coded core course (not a title-keyword placeholder like Professional Training) added to every department's course-plan CSV and to Semester 8 of every `public/data/department_plans/{DEPT}.md`, with `prerequisiteCode = "90 CR. or more"`. It rides the existing generic "N CR" prerequisite gate in `checkPrerequisites()` — no bespoke eligibility code — so it appears in "Courses You Can Register" once the student hits 90 credit hours, and needs no special-casing in `courseGraphBuilder.ts` (it flows through as a normal plan-coded node). `getPracticalTrainingStatus()` (`courseAnalyzer.ts`) reads its completion/ungraded state directly off the transcript by code (`PRACTICAL_TRAINING_CODE` in `constants.ts`), surfaced in `AnalysisReport` as `practicalTrainingCompleted` / `practicalTrainingUngraded` / `practicalTrainingEligible`, plus `practicalTrainingWarning` (true once `totalCreditHours >= GRADUATION_CREDIT_HOURS` (132) and the course still isn't completed — drives the warning chip in `AlertStrip.tsx`). Pass/fail (0 Cr), so like Professional Training its credits are excluded from `totalCreditHours`, semester registration loads, and GPA — that exclusion is maintained in `transcriptParser.ts`, `clientParser.ts`, and `CourseGraphView.tsx`.

### Graduation (132 credit-hour requirement)

Graduation requires `GRADUATION_CREDIT_HOURS` (132, in `constants.ts`) **earned** credit hours *and* every remaining requirement cleared. Both report generators compute three `AnalysisReport` fields (kept in sync per the dual-parser note): `creditHoursToGraduation` (`max(0, 132 - totalCreditHours)`), `graduationCreditRequirementMet` (`totalCreditHours >= 132`), and `graduationEligible` (credit requirement met **and** `remainingMajorElectives`/`remainingScienceElectives`/`remainingUniversityRequirements`/`remainingProfessionalTraining` all `0` **and** `practicalTrainingCompleted` **and** a passing GPA — see Academic probation below). Key subtlety: these use **earned** `totalCreditHours`, not `expectedCreditHours` — pending `U` grades don't graduate a student. The cockpit surfaces this as a "To Graduate" cell in `StudentBar.tsx` plus a chip in `AlertStrip.tsx` (green = eligible, blue = 132 met but requirements outstanding, gray = still accumulating); `formatReportAsText` (in both `reportGenerator.ts` and `reportFormatter.ts`) mirrors it in the download/print export. This is distinct from `practicalTrainingWarning`, which fires purely on the 132 threshold regardless of other requirements.

### Academic probation ("half-load")

A student whose **cumulative GPA is below `PROBATION_GPA_THRESHOLD` (2.0)** is on probation. GPA comes from the transcript: `transcriptParser.ts`'s `extractGpaFromText()` (the last printed `G.P.A` value) populates `TranscriptData.gpa`. Both report generators derive `AnalysisReport.onProbation` (`gpa != null && gpa < 2.0`) — a *known* GPA is required, so manual-entry transcripts (no GPA) are never flagged. Constants live in `constants.ts` (`PROBATION_GPA_THRESHOLD`, `PROBATION_HALF_LOAD_CREDITS` = 12, `PROBATION_MAX_SEMESTERS` = 3).

Four enforcement points, all keyed off `onProbation`:

1. **12 Cr half-load in manual planning** (`CourseGraphView.tsx`): while on probation, `handleNodeClick` hard-blocks cycling a course to "Registered" once the running registered-credit total (sum of `ungraded`-status nodes) would exceed 12 Cr, surfacing a transient `capWarning`. A red `Registered: N/12 Cr.` tally shows in manual mode.
2. **Probation alert + semester counter**: `AlertStrip.tsx` (report view) renders a red chip whose detail panel carries the half-load rules, and `CourseGraphView.tsx` (graph view) renders a red banner. The counter is `probationSemesters` — a **best-effort heuristic** from `extractProbationSemesters()` (`transcriptParser.ts`), which counts how many printed `G.P.A` values fall below 2.0; degrades to no count (0) when unparseable. `probationSemestersExceeded` (≥ 3) drives a dismissal-risk warning.
3. **Project I blocked** (requirement 4): Project I appears under different codes per department (`CCS4901`/`CSE4901`/`CIS4901`/`CCY4901`/`CGM4901`), so it's matched by title via `isProjectOneTitle()` (`constants.ts`) — "Project II" must not match. `getAvailableCourses()` (`courseAnalyzer.ts`, given `gpa`) excludes it from "Courses You Can Register"; `CourseGraphView`'s manual `recompute` also forces its node to `blocked`. Note this is distinct from Practical Training (`CIT4000`), which shares the 90 CR gate but is **not** GPA-gated.
4. **Graduation blocked** (requirement 5): `graduationEligible` additionally requires `gpa === null || gpa >= 2.0` (unknown GPA doesn't block). Both generators + both text formatters (`reportGenerator.ts`, `reportFormatter.ts`) mirror the probation line.

Per the dual-parser note, the `onProbation`/`probationSemesters`/`probationSemestersExceeded` fields and the graduation-GPA gate are duplicated in both `reportGenerator.ts` and `clientReportGenerator.ts`.

### Semesters and retake advice

Every course parsed from a PDF carries the academic term it was taken in:
`StudiedCourse.semester?: Semester` (`{ term: "First" | "Second" | "Summer", startYear, endYear, label }`, `src/types/course.ts`).

**Why this needs layout, not text.** The transcript prints **two semester tables side by side** per block, and pdf.js emits fragments in an order that interleaves both columns and puts each semester header *after* the courses it covers. Reading order therefore can't link a course to its semester. `transcriptParser.ts` now keeps each fragment's `transform` x/y (`PositionedItem`) and:

1. `groupIntoRows()` buckets fragments by page + baseline y (`ROW_Y_TOLERANCE`), top-to-bottom (PDF y grows upward).
2. `findColumnSplit()` finds the x dividing the two tables. It is the **start of the right-hand course-code column** (far side of the widest gap between code x positions), *not* the page midpoint — the left table's own grade/GPA columns run past the midpoint, so a midpoint split silently drops every left-column course. Returns `Infinity` for single-column layouts.
3. Within a row+column, each course code (`COURSE_CODE_PATTERN`) starts a slice running to the next code; the slice is joined and matched with `COURSE_LINE_PATTERN` via `parseCourseLine()` (shared with the flat-text fallback, so the two scans can't drift).
4. A course takes the nearest semester header **above it in its own column** (`findSemesterAbove`), falling back to any column on the page.

`extractCoursesFromText()` remains as a fallback when the layout yields nothing — courses from that path have no semester. Courses are then sorted chronologically (`sortCoursesChronologically`), so "latest attempt wins" rules see the real sequence.

`src/lib/analysis/semester.ts` owns the model: `parseSemesterLabel()`, `semesterIndex()` (terms since year 0 — one academic year is `TERMS_PER_ACADEMIC_YEAR` = 3), `compareSemesters()`, `getLatestSemester()`.

**Retake recommendations** (`getRetakeRecommendations()`): a course whose standing grade is in `RETAKE_GRADES` (`D+`, `D`, `D-` — "D+ and under") and that was taken within `RETAKE_WINDOW_TERMS` (3 terms = one academic year) of the transcript's **latest semester**. The window is anchored on the transcript's own latest semester, not the real-world date, so advice is reproducible from the document alone. Excluded: courses already retaken with a better grade, courses with a `U` attempt (retake in progress), and courses with no semester (an unknown date can't be shown to be in-window). Surfaced as `AnalysisReport.retakeRecommendations` + `latestSemester` — computed in **both** report generators per the dual-parser note — rendered as the "Recommended Retakes" card in the cockpit and mirrored in both text formatters. Manual-entry transcripts have no semesters, so they never produce retake advice.

### Course-code canonicalization

`canonicalizeCode()` (`constants.ts`) is the single normalization used everywhere two codes are compared — it strips non-alphanumerics, uppercases, and resolves cross-plan equivalences (e.g. `CCS3601` ⇄ `CAI3101`, both "Introduction to AI"). The transcript parser, `courseAnalyzer.ts`, and `courseGraphBuilder.ts` all key off it, so a course taken under one code counts everywhere the equivalent code appears. When adding a code alias, add it to `COURSE_CODE_EQUIVALENCE`, not to individual call sites. `isTwoCreditCourse()` (UNR-prefixed or `CNC1401`) is the shared 2-vs-3 credit rule.

### Course prerequisite graph view

`CourseGraphView.tsx` (React Flow / `@xyflow/react`) renders the department's full course plan as a prerequisite DAG, color-coded by the student's status. The pure, testable node/edge builder is `courseGraphBuilder.ts` (`buildCourseGraph`), which reuses the same canonicalization and prerequisite-parsing rules as the report so the graph never disagrees with it. Node status is derived from the `AnalysisReport` sets (completed/available/ungraded/failed) plus per-category elective-slot counting; edges come from parsing each course's `prerequisiteCode` (a `"… CR"` prerequisite is a credit-hour gate, rendered as a badge with no edge rather than an edge).

Elective placeholder slots fill by category in priority order: **completed** slots first (`report.completed{Science,Major,University}Electives`), then **ungraded/registered** slots (`report.ungraded{Science,Major,University}Electives` — a course taken with a `U` grade that matches an elective CSV, e.g. Advanced Physics/Biochemistry as a Science Elective), then remaining slots stay empty `"elective"` placeholders. The `ungraded*Electives` fields are produced by `getUngradedElectives()` (`courseAnalyzer.ts`, the `U`-grade mirror of `getCompletedElectives()`) and, per the dual-parser note, are computed in **both** `reportGenerator.ts` and `clientReportGenerator.ts`. (Professional Training has no separate ungraded field — `getProfessionalTraining()` already treats `U` as satisfied.)

**Layout is driven by the study plans in `public/data/department_plans/{DEPT}.md`** — one markdown table per semester (1–8). `loadPlanSemesters()` parses these into a code→semester map plus per-category elective-slot queues; `layoutBySemester()` then makes each column a semester. If a plan file is missing/unparseable, it falls back to `layoutByDepth()` (columns = longest prerequisite-chain depth). Plan codes carry footnote noise the parser strips (leading `1`/`2` reference numbers, trailing `*`, embedded spaces) before canonicalizing to match the CSVs.

### AI advisor notes (`src/lib/ai/`)

An on-demand LLM summary of an already-computed report, rendered as the "AI Advisor Notes" card (`src/components/report/AiNotesCard.tsx`) behind a Generate button. Three rules define it:

- **Advisory only.** `courseAnalyzer.ts` stays the source of truth. The model receives the computed lists and flags and only narrates/prioritises them; the system prompt (in the edge function) forbids naming a course not present in the input or contradicting any eligibility/probation/graduation flag. Course titles are treated as data, never instructions.
- **Anonymized.** `anonymizeReport()` (`anonymize.ts`) is the only thing sent. It drops `studentName`, never touches `TranscriptData` (so `studentId` has no path to it), flattens courses to `{code, title, grade}`, and caps list lengths — the payload doubles as the prompt, so size is cost.
- **Keyless client.** `output: "export"` means no server and no place for an API key, so the call goes to the `advise` Supabase Edge Function (`supabase/functions/advise/index.ts`) holding `GEMINI_API_KEY` — the same "anon may execute, anon may not read behind" shape as `verify_advisor`. It validates shape and rate-limits per IP *before* spending a model call (staff ID is not an authenticated identity — `session.ts` is a localStorage gate — so it must not key the limit). `generateAdvice.ts` is the single call site and never throws: every failure comes back as `throttled`/`unavailable` so the report still renders. Swapping provider = edge function + secret, not this signature. Deploy steps in `supabase/README.md`.

- **Rationed.** The feature is under evaluation, so usage is capped in three layers, and only the last one is a boundary: `adviceQuota.ts` allows 3 generations per browser per day (localStorage — pacing and a visible "N of 3 left today", trivially cleared); the edge function rate-limits 5/minute per IP in memory (per-isolate, so it bounds one runaway client, not a cohort); and `consume_advice_quota` (`supabase/ai_advice_quota.sql`, one row per UTC day, granted to `service_role` only) enforces a global `ADVICE_DAILY_LIMIT` (default 50) across every advisor. The quota claim happens *after* validation and *before* the model call, and **fails closed** — an unreachable counter returns 503 rather than an unmetered spend. HTTP 429 therefore means two different things, distinguished by a `reason` field: `"rate"` → `AdviceResult.throttled` ("wait a minute"), `"daily"` → `daily-limit` ("resets at 00:00 UTC"). `AiNotesCard.tsx` renders a permanent amber "Feature under testing" note above the advice — it is not `print:hidden`, since a printed copy needs the same caveat.

`supabase/functions` is excluded from `tsconfig.json` and `eslint.config.mjs` — it's Deno, with its own globals.

### Course graph interactive modes

The view has three interactive modes layered over the base graph (styling is recomputed via `useMemo`, never by rebuilding the graph): **Manual planning** (click a node to cycle Auto → Registered → Finished → Not taken; availability and the live achieved-credit-hour tally recompute downstream from prerequisites and credit gates), a **GPA calculator** (project hypothetical grades onto registered/ungraded courses; grade points use the CCIT scale in `CourseGraphView.tsx`, distinct from `constants.ts` `GRADES`), and the **Semester planner** (below). Clicking a node outside manual mode highlights its full transitive prerequisite chain.

### Semester planner (`semesterPlanner.ts` & `CourseGraphView.tsx`)

The planner is an **advisor-driven manual builder**, not an auto-scheduler. In `CourseGraphView.tsx`, turning on Semester planner displays a **side-by-side workspace with a vertical collapsible sheet** docked on the right side of the full-height prerequisite graph:
- **Interactive Graph Canvas**: The graph canvas stays full-height and unobstructed. When an active future semester is selected, eligible courses in the graph glow with a green ring and display a `＋` button (or `−` to remove), allowing direct point-and-click assignment into the target semester.
- **Vertical Collapsible Sheet**: Can be expanded or collapsed to a slim tab strip (`⇥ Expand Plan` / `⇤ Hide Plan Sheet`). It houses:
  1. *Completed Semesters*: Collapsible accordion showing transcript history.
  2. *In-Progress Semesters*: Registered terms with interactive grade projection selectors.
  3. *Planned Future Semesters*: Vertical cards showing term load (`Load / Ceiling Cr`), running cumulative earned credits (`Total: N/132 Cr`), overload/half-load badges, start GPA, placed courses with projected grades, remove buttons, and inline course-picker dropdowns.
  4. *Summer Semester Option*: Available to add after any Second Semester (via top action bar, inline on Second semester cards, or bottom action buttons). Summer terms enforce `PLANNER_SUMMER_NORMAL_LOAD` (6 Cr) as the normal load while allowing registration up to `PLANNER_SUMMER_MAX_LOAD` (9 Cr ceiling), highlighted with amber styling when exceeding normal load.

`evaluateManualPlan()` is the pure, data-only scorer (no React / React Flow types, mirroring `courseGraphBuilder.ts`): it walks the advisor's terms in order, advancing projected earned credits and a running projected GPA, and returns per-term caps plus a validity flag per placed course. It never places courses itself — `eligibleForTerm()` returns which remaining requirements *can* be added to a given semester (prerequisites completed by that term's start, credit-hour gate met by the projected earned credits, Project I excluded while the projected GPA is on probation). Per-semester caps reuse the report's registration rules, recomputed from the running GPA and year band at each term's start: Years 1–2 (`< PLANNER_YEAR_UPPER_CREDIT_THRESHOLD` earned) 18 Cr; Years 3–4 15 Cr (pushable to 18); Summer semesters 6 Cr normal load (up to 9 Cr max); 21 Cr overload when the projected GPA exceeds `PLANNER_OVERLOAD_GPA_THRESHOLD`; 12 Cr half-load (and Project I blocked) while it's under `PROBATION_GPA_THRESHOLD`. All `PLANNER_*` constants live in `constants.ts`. Pass/fail training (Professional Training slots, Practical Training `CIT4000`) carries **0 Cr load/earned/GPA credits**. This is graph-view-only state, so unlike the report fields it is **not** duplicated across the two report generators.
