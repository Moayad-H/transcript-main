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

### 4.2.1 Batch upload & printable graph flow

1. **`FileUpload.tsx` (Batch Mode) → `page.tsx`**: Advisor uploads a `.zip` archive, a folder of PDFs (via `webkitdirectory`), or multiple PDF transcripts.
2. **`batchTranscriptProcessor.ts`**:
   - Recursively extracts `.pdf` files from `.zip` archives client-side using `jszip` (skipping OS artifacts like `__MACOSX` and `.DS_Store`).
   - Sequentially parses each transcript with `parseTranscriptPDF`, generates an advising report via `generateReport`, and builds the prerequisite DAG via `buildCourseGraph`.
   - Emits real-time progress events (`extracting`, `parsing`, current file, percentage).
   - Resiliently records individual parsing errors without interrupting the batch.
3. **`BatchGraphView.tsx` & `PrintableStudentGraph.tsx`**:
   - Renders a batch cohort dashboard with aggregate metrics (total students, avg GPA, probation count, graduation ready count).
   - Shows a printable course graph sheet for each student with student info, academic standing, status legend, and 8-term prerequisite curriculum matrix with earned grades.
   - 1-click **"Print All Students"** and single-student print targeting with landscape print rules (`@page { size: landscape; margin: 8mm; }` and `page-break-after: always;`).
   - Supports search/filters (by student name/ID/department) and toggle to an interactive single-student React Flow graph view.

### 4.2.2 Single-student high-fidelity print engine (`ReportDisplay.tsx`)

Clicking "Print" in `StudentBar.tsx` dynamically builds the prerequisite graph (`buildCourseGraph`) if not already generated, renders `PrintableStudentGraph.tsx` in a `hidden print:block` container, and hides the interactive cockpit view with `print:hidden`. This guarantees single-student prints match the high-fidelity landscape curriculum sheet of batch printing rather than dumping raw cockpit dashboard UI. Temporarily updates `document.title` to the student's name for clean default PDF file naming, restoring the original title post-print, and suppresses trailing page breaks on single-student prints.

### 4.2.3 Official Semester Study Plan & Print Roadmap (`CourseGraphView.tsx`)

Advisors can assemble multi-semester graduation roadmaps in the Semester Planner. Clicking "Print Plan" opens an official preview modal (`PrintableSemesterPlan.tsx` rendered via `createPortal`) displaying an institutional CCIT header, student summary metrics, probation badges, in-progress projections, future term matrices with projected GPAs and running credit totals toward the 132 Cr requirement, advising disclaimers, and formal Student & Advisor signature lines. Activates portrait print rules (`body.printing-semester-plan`, `@page { size: portrait; margin: 10mm; }`) and auto-saves draft plans to `localStorage` keyed by student ID and department (`planner_plan_${studentID}_${department}`).

### 4.2.4 Advisor Activity Audit Logging System (`auditLogger.ts`)

Non-blocking, zero-dependency async client audit logger invoking the Supabase REST API via native `fetch`. Captures key actions (`LOGIN`, `LOGOUT`, `TRANSCRIPT_PARSED`, `BATCH_PROCESSED`, `DEPARTMENT_CHANGED`, `REPORT_DOWNLOADED`, `BATCH_PRINTED`, `STUDENT_PRINTED`, `SEMESTER_PLAN_PRINTED`, `SEMESTER_PLAN_CLEARED`, `SCHEDULE_VIEWED`, `SCHEDULE_GROUP_CHANGED`, `SCHEDULE_PRINTED`, `SCHEDULE_UPLOADED`, `SCHEDULE_RESET`, `GUIDE_VIEWED`) into the append-only `advisor_audit_logs` table. Protected by Row Level Security (RLS) restricting anonymous clients to `INSERT`-only with `UPDATE`/`DELETE` revoked.

### 4.2.5 Outstanding Failed (F) Course Recommendation Prioritization (`courseAnalyzer.ts`)

In `splitAvailableCourses`, eligible courses with an uncompleted failing grade (`F`) are prioritized ahead of all untaken courses (`priorityTier: 0`, `isOverdue: true`). This ensures that students with outstanding $F$ courses (especially those on probation under the 12 Cr half-load cap) are guaranteed to receive recommendations to register their failed courses first to replace 0.0 grade points, unblock downstream prerequisite chains, and maximize cumulative GPA recovery. Retakes of passed courses ($D/D+$) remain in the separate "Recommended Retakes" section.

### 4.2.6 Advisor Guide & Tutorial System (`AdvisorGuideModal.tsx`)

Comprehensive interactive onboarding and reference manual modal in English & Arabic accessible via the "Advisor Guide" / "دليل المرشد" button in `Header.tsx`. Covers student privacy principles, cockpit layout, the 4-tier course recommendation algorithm, semester planner workflows, batch processing, and audit compliance.

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
- **Credit value**: 3 per course, **except** 2-credit courses: any `UNR`-prefixed course (University Requirements) **or** `CNC1401` (Entrepreneurship Skills). Evaluated via `isTwoCreditCourse(canonical)` so equivalent course codes (e.g. `NE364` ⇄ `UNR2303`) receive proper 2-credit valuation. Other `CNC` courses are standard 3-credit.
- **Professional Training** courses are excluded from the hour count entirely (subtracted back out via `professionalTrainingCount * 3`).

### Course-code canonicalization & Regex — critical

`canonicalizeCode()` (`constants.ts`) is the **single normalization** used everywhere two codes are compared: strips non-alphanumerics, uppercases, resolves cross-plan equivalences.
- Cross-plan equivalences (`COURSE_CODE_EQUIVALENCE`):
  - `CCS3601 ⇄ CAI3101` (both "Introduction to AI").
  - `NE364 ⇄ UNR2303` (Faculty of Engineering "Engineering Economy" ⇄ Computing "Engineering Economy").
- Parser regex: `COURSE_CODE_PATTERN` and `COURSE_LINE_PATTERN` in `transcriptParser.ts` support `^[A-Z]{2,4}\d{3,4}$` (accommodating 2-letter prefixes and 3-digit course numbers like `NE364` or transfer codes).
- Course title normalization (`courseAnalyzer.ts`): `normalizeCourseTitle` normalizes "economics" to "economy", ensuring elective matching (`getCompletedElectives`, `getUngradedElectives`) and out-of-plan exclusion work reliably across minor department titling variations.

**Add new aliases to `COURSE_CODE_EQUIVALENCE`, never to individual call sites.**

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

Three interactive modes layered over the base graph (styling recomputed via `useMemo`, graph never rebuilt):
- **Manual planning** — click a node to cycle Auto → Registered → Finished → Not taken; availability + live achieved-credit tally recompute downstream from prereqs and credit gates.
- **GPA calculator** — project hypothetical grades onto registered/ungraded courses. Grade-point scale (CCIT) lives **inside `CourseGraphView.tsx`**, distinct from `constants.ts` `GRADES`.
- **Semester planner** (`semesterPlanner.ts` & `CourseGraphView.tsx`) — advisor-driven multi-term graduation roadmap builder in a side-by-side workspace with a collapsible right-hand sheet:
  - *Interactive canvas*: Target term glows with a green ring; eligible nodes display `＋` / `−` buttons for point-and-click addition/removal.
  - *Collapsible plan sheet*: Displays completed transcript history, in-progress courses with grade selectors, planned future terms (load caps, running cumulative credits toward 132 Cr, starting and projected GPA), and summer terms (6 Cr normal, 9 Cr ceiling).
  - *Auto-Save Drafts*: State is automatically persisted to `localStorage` (`planner_plan_${studentID}_${department}`), displaying a `💾 Plan saved` badge on modification. Drafts are restored automatically when reopening the student; cleared via "Clear plan".
  - *Official Printable Semester Study Plan* (`PrintableSemesterPlan.tsx`): High-fidelity formal advising roadmap rendered in a preview modal (`createPortal`) and formatted for portrait A4 printing (`body.printing-semester-plan`, `@page { size: portrait; margin: 10mm; }`). Includes institutional header, student metrics, probation standing badges, graduation readiness alerts, in-progress grade projections, future term tables, academic disclaimer, and Student & Advisor signature sign-off lines.

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
  FileUpload.tsx (177)        dropzone + kicks off parsing (single & batch modes)
  StudentForm.tsx (98)        name / dept entry
  ManualEntryForm.tsx (132)   manual course entry fallback → clientParser
  ReportDisplay.tsx (410)     report/graph toggle, high-fidelity single print trigger
  ReportSection.tsx (48)      reusable category list
  CourseGraphView.tsx (800+)  React Flow graph + manual + GPA + Semester Planner & Print
  Header.tsx (65)             header + Advisor Guide launcher button
  AdvisorGuideModal.tsx (495) multi-tab Arabic/English advisor manual modal
  RemoteBanner.tsx (222)      Edge Config broadcast announcement banner
  batch/                      BatchGraphView.tsx, PrintableStudentGraph.tsx
  planner/                    PrintableSemesterPlan.tsx (official printable study plan)
  report/                     NextSemesterHero, CourseRow, StudentBar, AcademicAuditCard, etc.

src/lib/analysis/
  transcriptParser.ts (350)   *** ACTIVE PDF parser (pdfjs-dist) with 2-4 letter prefix regex ***
  reportGenerator.ts (284)    *** main report generator ***
  courseAnalyzer.ts (290)     eligibility/requirement logic with title normalization (see logic.md)
  courseGraphBuilder.ts (421) pure graph node/edge builder
  clientParser.ts (153)       STUB (throws) + createTranscriptFromManualEntry
  clientReportGenerator.ts (128)  manual-entry report generator
  semesterPlanner.ts (220)    pure semester planner evaluator & credit cap logic

src/lib/data/  csvLoader.ts, clientCsvLoader.ts   (fetch+parse public/data CSVs)
src/lib/logging/ auditLogger.ts (105) non-blocking Supabase audit logger
src/lib/utils/ batchTranscriptProcessor.ts, reportFormatter.ts, helpers.ts, fileValidation.ts
src/lib/constants.ts (105)    departments, grades, prefixes, canonicalizeCode, credit rules, equivalents
src/types/     course.ts, report.ts, transcript.ts, schedule.ts, index.ts
supabase/      advisor_audit_logs.sql, README.md
```

Infra: `Dockerfile` (multi-stage), `nginx.conf`, `docker-compose.yml`, `next.config.ts` (static export).

---

## 9. Recent work & history (most recent first)

- **v0.7.1: Timetable Schedule Finder & Course Registration Customization Engine**
  - **Timetable Schedule Finder (`scheduleFinder.ts`, `ScheduleFinderModal.tsx`, `TimetableGrid.tsx`)**:
    - **Base Group Registration Prioritization**: Prioritizes registering all courses from a single cohort/base group (e.g. `3CS1`, `5SE1`, `2CS1`) matching the student's department and target semester, ensuring cohesive cohort scheduling without internal time slot collisions.
    - **Placement-Aware Missing Course Matching (`departmentPlanMapper.ts`)**: When a recommended course or retake is absent from the chosen base group (e.g., `EBA1204` for a third-semester student), the engine references the department study plans (`public/data/department_plans/*.md`) to resolve its curricular term (e.g., Term 2), inspects candidate groups for that term (`2CS1`..`2CS3`), and assigns a collision-free timetable slot.
    - **Collision Detection & Multi-Solution Ranking**: Implemented time-slot collision validation across 6 standard AAST periods (8:30–20:10) and 6 academic days (Saturday to Thursday), generating ranked alternative base group solutions.
    - **Course Customization from Available Registration Pool**: Enables advisors to swap any course directly for an alternative from the student's eligible courses pool (Recommended Core, Other Eligible Core, Major Electives, Science Electives, University Requirements, Professional Training), add extra subjects, or drop courses, with automatic real-time timetable recalculation and collision checking.
    - **Interactive Timetable Cockpit & Print Parity**: Full-featured modal displaying base group selector with recommendations, course assignment status badges (Base Group vs Alt Group placement), manual group overrides, color-coded weekly matrix with conflict banners, and clean browser print support.
  - **Schedule Ingestion & Dataset Bundling (`scheduleParser.ts`, `scheduleLoader.ts`, `default_schedules.json`)**:
    - Extracted and bundled 46 default semester groups from institutional timetable PDFs across terms 2, 3, 4, 5, 8 (CS, IS, SE, CY, AI).
    - Client-side timetable PDF parser using `pdfjs-dist` to dynamically parse newly uploaded semester PDFs, merging custom schedules into browser storage (`localStorage`) with one-click restore to defaults.
  - **UI Entry Points (`NextSemesterHero.tsx`, `StudentBar.tsx`, `ReportDisplay.tsx`)**:
    - Added `📅 Find Schedule` button to the Registration Hub actions bar, passing the student's active registration basket directly into the solver.
    - Added quick-access `📅 Schedule` button in `StudentBar.tsx`.
- **v0.7.0: Outstanding Failed (F) Course Recommendation Prioritization**

  - **Guaranteed Failed Course Prioritization (`courseAnalyzer.ts`)**: In `splitAvailableCourses`, eligible courses with an uncompleted failing grade (`F`) are assigned Priority Tier 0 and flagged as overdue (`isOverdue: true`). This guarantees that failed courses are always placed at the top of next-semester recommendations (both under standard semester loads and the 12 Cr probation half-load cap), ensuring students address prerequisites and replace 0.0 grade points for maximum cumulative GPA recovery.
  - **Dual Report Generator Invariant (`reportGenerator.ts`, `clientReportGenerator.ts`)**: Kept both server and client report generators in sync by extracting uncompleted failed course codes from `withdrawnFailedCourses` and passing them into `splitAvailableCourses`.
- **v0.6.5: Official Semester Study Plan, Single-Print Parity, Advisor Guide & Supabase Audit System**
  - **Official Semester Study Plan & Printable Graduation Roadmap (`PrintableSemesterPlan.tsx` & `CourseGraphView.tsx`)**:
    - Built a dedicated printable study plan modal and graduation roadmap component (`PrintableSemesterPlan.tsx`) rendered via React portal (`#semester-plan-print-portal`).
    - Surfaces institutional CCIT header, student metadata, academic standing badge (Good Standing vs Half-Load Probation), graduation readiness alert (when $\le 18$ credits remain), in-progress courses with projected grades, and planned future semesters (credit load, cumulative progress to 132 Cr, starting GPA, projected GPA).
    - Formatted with official advising disclaimers and dual formal signature sign-off lines (Student Signature & Academic Advisor Signature with date lines).
    - Added dedicated A4 portrait printing rules (`body.printing-semester-plan`, `@page { size: portrait; margin: 10mm; }`), clean modal controls with keyboard Escape dismissal, and dynamic browser `document.title` formatting (`"{Student Name} - Semester Study Plan"`).
    - Implemented client-side draft auto-saving to `localStorage` (`planner_plan_${studentID}_${department}`) with visual save indicator badge (`💾 Plan saved`) and explicit plan reset button.
  - **Single-Student High-Fidelity Print Parity (`ReportDisplay.tsx`, `PrintableStudentGraph.tsx`, `StudentBar.tsx`)**:
    - Aligned single-student printing from `ReportDisplay.tsx` to mount `PrintableStudentGraph.tsx` in `print:block` (dynamically generating the prerequisite DAG via `buildCourseGraph` if not yet loaded) while hiding the interactive cockpit with `print:hidden`.
    - Solved the trailing blank page issue by applying `print:break-after-auto` and `.no-break-after` to single students or the final student in a batch, retaining `print:break-after-page` only between intermediate batch items.
    - Added dynamic `document.title` temporary assignment to the student's name in `BatchGraphView.tsx` and `ReportDisplay.tsx` for clean PDF file naming.
    - Removed redundant text download button from `StudentBar.tsx` in favor of high-fidelity printing.
  - **Advisor Guide & Interactive Tutorial Modal (`AdvisorGuideModal.tsx`, `Header.tsx`, `page.tsx`)**:
    - Created a comprehensive, 6-tab bilingual (Arabic/English) academic advisor manual modal explaining client-side privacy architecture, 2-zone cockpit navigation, 4-tier scheduling rules, semester planner mechanics, batch processing, and audit compliance.
    - Added an always-accessible "Advisor Guide" / "دليل المرشد" button in `Header.tsx` and automated first-time onboarding launch tracked via `localStorage.getItem("advisor_guide_seen")`.
  - **Zero-Dependency Supabase Advisor Audit Logging System (`auditLogger.ts`, `supabase/advisor_audit_logs.sql`)**:
    - Implemented non-blocking, fire-and-forget client audit logger using native browser `fetch` against the Supabase REST API (0 extra npm packages, 0 KB bundle weight, fully error-suppressed).
    - Created append-only `advisor_audit_logs` table with Row Level Security (RLS) restricting anon clients to `INSERT` only (with `UPDATE` and `DELETE` revoked to preserve tamper-proof audit trails). Indexed on `created_at`, `staff_id`, `student_id`, and `action`.
    - Instrumented actions: `ADVISOR_LOGIN`, `TRANSCRIPT_PARSED`, `BATCH_TRANSCRIPT_PARSED`, `DEPARTMENT_CHANGED`, `REPORT_DOWNLOADED`, `BATCH_PRINTED`, `STUDENT_PRINTED`, and `SEMESTER_PLAN_PRINTED`.
  - **Engineering Economy Multi-Faculty Equivalence & Parsing Resilience (`courseAnalyzer.ts`, `transcriptParser.ts`, `clientParser.ts`, `constants.ts`, `university.csv`)**:
    - Added `NE364: "UNR2303"` mapping in `COURSE_CODE_EQUIVALENCE` to resolve Faculty of Engineering transfer credits for Engineering Economy into Faculty of Computing equivalents.
    - Updated `COURSE_CODE_PATTERN` and `COURSE_LINE_PATTERN` in `transcriptParser.ts` to `^[A-Z]{2,4}\d{3,4}$` to support 2-letter prefixes and 3-digit numbers.
    - Implemented `normalizeCourseTitle` (mapping `economics` $\rightarrow$ `economy`) and integrated title-based matching in `getCompletedElectives`, `getUngradedElectives`, and `getOutOfPlanCourses` to bridge slight departmental title divergences.
    - Updated 2-credit course validation in `transcriptParser.ts` and `clientParser.ts` to check `isTwoCreditCourse(canonical)` rather than raw code.
    - Added `GEN3301` / `UNR2303` ("Engineering Economy", 2 credits) to `public/data/electives/university.csv`.
  - **Viewport Overflow & Scroll Mechanics Polish (`globals.css`, `page.tsx`)**:
    - Refined mobile and desktop viewport overflow handling, eliminating double scrollbars in cockpit and student graph views.
- **v0.6.3: Batch Transcript Upload & Printable Student Course Graphs**
  - **Batch Transcript Processing (`batchTranscriptProcessor.ts`)**: Added support for uploading and parsing multiple transcripts simultaneously from `.zip` archives or folders (via native `webkitdirectory` or multi-file selection). Client-side unzipping via `jszip` filters out system metadata (`__MACOSX`, `.DS_Store`) and processes PDFs sequentially into `TranscriptData`, `AnalysisReport`, and `CourseGraph` structures with real-time extraction/parsing progress callbacks and resilient error isolation.
  - **Printable Student Course Graph View (`PrintableStudentGraph.tsx`)**: High-fidelity printable student advising sheet displaying student name, ID, department, GPA, earned/in-progress/expected credits, academic standing badges (Good Standing vs Half-Load Probation), status legend, 8-term curriculum course matrix with earned letter grades, and next-semester recommendation bar. Configured with dedicated `@media print` rules (`@page { size: landscape; margin: 8mm; }`, `break-after: page;`, `print-color-adjust: exact;`) for clean 1-page-per-student printing.
  - **Batch Advising Dashboard (`BatchGraphView.tsx`)**: Cohort control center with summary statistics (total transcripts, average GPA, probation count, graduation ready count), 1-click **"Print All Students"** and individual student print targeting, dynamic search (by student name, ID, filename), department filter, sorting (by Name, ID, GPA, Credits), and dual view modes (printable sheets preview vs single-student interactive React Flow graph).
  - **Upload Screen Mode Selector (`FileUpload.tsx`)**: Added a segmented mode toggle between *Single Transcript* and *Batch Mode (Folder or ZIP)* with drag-and-drop, quick file pickers (`Select ZIP`, `Select Folder`, `Multiple PDFs`), file preview badge, optional batch-wide department override, and live progress bar.
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
- **2-credit courses** → evaluate `isTwoCreditCourse(canonical)`, don't evaluate raw codes directly or hardcode.
- **Course code regex in parsers** → `^[A-Z]{2,4}\d{3,4}$` accommodates 2-letter prefixes and 3-digit course numbers (e.g. `NE364`). If adjusting course line extraction, keep `COURSE_CODE_PATTERN` and `COURSE_LINE_PATTERN` in sync.
- **Elective title normalization** → `normalizeCourseTitle` normalizes "economics" $\rightarrow$ "economy" across `getCompletedElectives`, `getUngradedElectives`, and `getOutOfPlanCourses`. If matching courses by title, normalize both strings.
- **Two distinct print targets in CSS**:
  - Landscape Student Course Graph: `@page { size: landscape; margin: 8mm; }` via `student-print-sheet`. Single or last student must use `print:break-after-auto` to avoid blank trailing sheets.
  - Portrait Semester Study Plan: `@page { size: portrait; margin: 10mm; }` via `body.printing-semester-plan` targeting `#semester-plan-print-portal`.
- **Dynamic document.title on print** → Temporarily overrides `document.title` to the student's name / study plan title before `window.print()` and restores it in cleanup/afterprint to ensure clean PDF export filenames.
- **LocalStorage keys**:
  - `planner_plan_${studentID}_${department}`: Auto-saved semester study plan drafts.
  - `advisor_guide_seen`: Advisor tutorial onboarding dismissal flag.
  - `edge_config_banner_dismissed_*`: Remote announcement banner dismissal flags.
- **Graph must agree with report** → `courseGraphBuilder.ts` reuses report sets + canonicalization; don't fork prereq logic.
- **Eligibility/remedial/out-of-plan/elective-counting rules** → read `logic.md` first; it governs `courseAnalyzer.ts`.
- **Ungraded `U`** → excluded from `totalCreditHours`, surfaced only via `expectedCreditHours`.
- **No API route** → download falls back to client-side text; don't assume a server.
- **Env issues** → use Docker rather than debugging global npm.
