

# Project Context: Transcript Analysis Application

## 1. Project Overview
This is a **Next.js 15+ (App Router)** application designed to assist in academic advising. It allows users to upload PDF student transcripts, which are then parsed and analyzed against department requirements to generate a progress report. The report highlights completed courses, remaining requirements, and available electives.

## 2. Tech Stack
- **Framework:** Next.js (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS (inferred from `globals.css` presence and modern Next.js defaults)
- **PDF Processing:** `pdfjs-dist`
- **Data Handling:** CSV parsing (custom loaders)

## 3. Architecture & Key Directories

### `src/app`
- **`page.tsx`**: The main entry point. Orchestrates the state between `FileUpload` and `ReportDisplay`.
- **`layout.tsx`**: Root layout.

### `src/lib/analysis` (Core Logic)
- **`transcriptParser.ts`**: Handles the raw PDF parsing using `pdfjs-dist`. Extracts student metadata (Name, ID, Major) and the list of studied courses using regex patterns.
- **`courseAnalyzer.ts`**: Contains the business logic to compare a student's transcript against curriculum requirements. Determines eligible courses and satisfied electives.
- **`reportGenerator.ts`**: The main coordination function that takes parsed data, loads necessary CSV data, and produces the final `AnalysisReport`.

### `src/lib/data` (Data Layer)
- **`csvLoader.ts` / `clientCsvLoader.ts`**: Responsible for fetching and parsing the static CSV files located in `public/data`.
- **`public/data`**: Contains the "database" of the application in CSV format:
    - `courses/`: Lists of courses per department (AI, CS, CY, SE, etc.).
    - `majors/`: specific major requirements.
    - `electives/`: Lists of science and university electives.

### `src/components` (UI)
- **`FileUpload.tsx`**: Handles file selection and initiates the parsing process.
- **`ReportDisplay.tsx`**: Renders the generated `AnalysisReport`.
- **`ReportSection.tsx`**: Reusable component for displaying sections of the report (e.g., "Major Electives").

## 4. Key Workflows

### Transcript Processing Flow
1. **User Action**: User uploads a PDF transcript via `FileUpload.tsx`.
2. **Parsing**: `transcriptParser.ts` reads the PDF text.
    - Extracts Student ID, Name, Major, Cumulative GPA.
    - Extracts list of `StudiedCourse` (Code, Title, Grade, Credits).
3. **Data Loading**: Based on the extracted Major (e.g., "SE", "CS"), the system loads the corresponding CSVs from `public/data`.
4. **Analysis**: `reportGenerator.ts` calls `courseAnalyzer.ts`:
    - Checks prerequisites.
    - Calculates completed credits.
    - Identifies remaining mandatory courses.
    - Categorizes completed electives.
5. **Visualization**: The resulting `AnalysisReport` object is passed to `ReportDisplay.tsx` for rendering to the user.

## 5. Key Data Models (`src/types`)
- **`Course`**: Basic course metadata (code, title, credits, prerequisites).
- **`StudiedCourse`**: Extends `Course` with the student's `grade`.
- **`TranscriptData`**: Aggregates student metadata and their list of `StudiedCourse`.
- **`AnalysisReport`**: The comprehensive output object containing:
    - `studentInfo`: Student metadata.
    - `academicStatus`: GPA, total hours.
    - `progress`: Breakdown of completed vs. required hours.
    - `recommendations`: Courses available to take next.
    - `electives`: Status of University, College, and Major electives.
