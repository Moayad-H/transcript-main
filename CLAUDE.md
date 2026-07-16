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
3. `ReportDisplay.tsx` renders the `AnalysisReport`; `ReportSection.tsx` is the reusable list renderer for each category.

There is no backend/API route (`src/app` has no subfolders) — everything runs in the browser. `/api/download-report` is referenced in `ReportDisplay.tsx` but falls back to a pure client-side text download (`reportFormatter.ts` + `helpers.ts`) if the fetch fails, since no such route currently exists in the repo.

### Grading and credit-hour rules (`src/lib/constants.ts` `GRADES`)

- `PASSING`: letter grades A+ through D-, plus `P` and `Tr` (transferred) — these count toward `totalCreditHours`.
- `FAILING`: `F`. `WITHDRAWN`: `W`. Both excluded from credit hours; tracked for remedial-course logic (see `logic.md`).
- `UNGRADED`: `U` — course taken, grade not yet posted. **Does not count toward `totalCreditHours`**, but its credit value is surfaced separately via `expectedCreditHours` (`totalCreditHours` + pending `U` credits) so students can see what they'll have once grades post.
- Credit value per course is 3, except codes prefixed `UNR` or `CNC` which are 2. Professional Training courses are excluded from the hour count entirely (subtracted back out via `professionalTrainingCount * 3`).

`logic.md` is the source of truth for course-eligibility/display rules (what counts as "available to register," remedial course precedence, elective counting, out-of-plan detection) — read it before touching `courseAnalyzer.ts`.

### Department/curriculum model

Departments are `CS | SE | IS | CY | AI | GM` (`constants.ts`). Each has a course-plan CSV, a major-electives CSV, and shares the two elective CSVs (science, university). Course prefixes map to categories (`COURSE_PREFIXES`): `CCS` (CS core), `EBA` (engineering/math), `UNR` (university), `CIS`/`CAI`/`CCY` (major-specific), `CNC` (entrepreneurship), `CIT` (IT — excluded from out-of-plan warnings per `logic.md`). Elective placeholder rows in the course-plan CSVs are detected by title keyword (`ELECTIVE_KEYWORDS`: "Prof", "Major", "Science El", "University") rather than course code.

Special remedial courses (`SPECIAL_COURSES`) have cross-dependency rules — e.g. Calculus I (`EBA1203`) is blocked while Precalculus (`EBA0201`) remediation is still owed; `UNR1403` is blocked while Remedial English (`GLA0001`) is still owed. This logic lives in `courseAnalyzer.ts`'s remedial handling and is documented in `logic.md`.
