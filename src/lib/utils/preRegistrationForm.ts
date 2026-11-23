/**
 * Pre-registration Form (.docx) Generator
 *
 * Fills the official CCIT Pre-registration Form Word template client-side
 * using JSZip while preserving the original header, logo, theme, fonts, and
 * table styling.
 *
 * Supports:
 * - Single student: one filled .docx file
 * - Batch (combined): one .docx file containing a separate table per student
 * - Batch (individual): a .zip archive containing one filled .docx per student
 *
 * Minor subject fields ("Number of Remaining Minors", "Taken Minor Electives")
 * are intentionally left blank.
 */

import JSZip from "jszip";
import { AnalysisReport, Course, Department, TranscriptData } from "@/types";
import { loadDepartmentData } from "@/lib/data/csvLoader";
import { loadPlanSemesters, PlanSemesters } from "@/lib/analysis/courseGraphBuilder";
import { getStudiedCourseCodes } from "@/lib/analysis/transcriptParser";
import {
  getElectiveRequirements,
  getWaivedRemedialCodes,
} from "@/lib/analysis/courseAnalyzer";
import {
  DEPARTMENT_NAMES,
  ELECTIVE_KEYWORDS,
  GRADES,
  PRACTICAL_TRAINING_CODE,
  PROFESSIONAL_TRAINING_SEQUENCE,
  SPECIAL_COURSES,
  canonicalizeCode,
} from "@/lib/constants";

export interface PreRegistrationStudentInput {
  report: AnalysisReport;
  transcriptData: TranscriptData;
}

export interface PreRegistrationFormData {
  studentId: string;
  studentName: string;
  achievedCreditHoursAfterCurrent: number;
  departmentCode: Department;
  departmentDisplay: string;
  remainingCourses: string[];
  remainingProfessionalTrainingCount: number;
  remainingProfessionalTrainingLines: string[];
  numberOfRemainingMajors: number;
  takenMajorElectives: string[];
}

const TEMPLATE_URL = "/templates/pre-registration-form.docx";

// In-memory caches to keep batch generation instantaneous
let cachedTemplateBuffer: ArrayBuffer | null = null;
const deptDataCache = new Map<
  Department,
  {
    courses: Course[];
    planSemesters: PlanSemesters | null;
  }
>();

/**
 * Fetch and cache the official Pre-registration Form .docx template.
 */
export async function fetchPreRegistrationTemplate(): Promise<ArrayBuffer> {
  if (cachedTemplateBuffer) {
    return cachedTemplateBuffer;
  }
  const response = await fetch(TEMPLATE_URL);
  if (!response.ok) {
    throw new Error(
      `Failed to load pre-registration form template (${response.status} ${response.statusText})`
    );
  }
  cachedTemplateBuffer = await response.arrayBuffer();
  return cachedTemplateBuffer;
}

async function getCachedDepartmentPlan(department: Department): Promise<{
  courses: Course[];
  planSemesters: PlanSemesters | null;
}> {
  const existing = deptDataCache.get(department);
  if (existing) return existing;

  const [deptData, planSemesters] = await Promise.all([
    loadDepartmentData(department),
    loadPlanSemesters(department),
  ]);

  const entry = { courses: deptData.courses, planSemesters };
  deptDataCache.set(department, entry);
  return entry;
}

/**
 * Pure computation of all Pre-registration Form fields for one student.
 *
 * Accounts for courses currently in progress ("U" grades) since the form
 * represents the student's status after the current semester:
 * - Achieved Credit Hours = expectedCreditHours (earned + current U credits)
 * - Remaining Courses = required plan courses neither passed nor currently U
 *   (plus any remaining Science / University elective slots after current U)
 * - Remaining Professional Training = remaining slots out of 4 (U already counted)
 * - Number of Remaining Majors = required major electives minus unique completed + U majors
 * - Taken Major Electives = completed major electives + currently in-progress (U) majors
 * - Minor fields are intentionally omitted.
 */
export function computePreRegistrationData(
  input: PreRegistrationStudentInput,
  coursePlan: Course[],
  planSemesters: PlanSemesters | null
): PreRegistrationFormData {
  const { report, transcriptData } = input;
  const departmentCode = transcriptData.department;
  const deptFullName = DEPARTMENT_NAMES[departmentCode];
  const departmentDisplay = deptFullName
    ? `${deptFullName} (${departmentCode})`
    : report.department;

  // Courses already passed OR currently registered (grade "U")
  const studiedSet = new Set(getStudiedCourseCodes(transcriptData.courses));
  const waivedRemedials = getWaivedRemedialCodes(transcriptData.courses);
  const precalcMandatory = departmentCode === "PSCS";

  // Collect remaining core courses from the department course plan
  const seenCodes = new Set<string>();
  const remainingCoreEntries: {
    code: string;
    title: string;
    semester: number;
    order: number;
  }[] = [];

  coursePlan.forEach((course, index) => {
    const canon = canonicalizeCode(course.code);
    if (!canon || seenCodes.has(canon)) return;

    // Skip elective & professional training rows (handled in their own sections/slots)
    if (
      course.title.includes(ELECTIVE_KEYWORDS.PROFESSIONAL) ||
      course.title.includes(ELECTIVE_KEYWORDS.MAJOR) ||
      course.title.includes(ELECTIVE_KEYWORDS.SCIENCE) ||
      course.title.includes(ELECTIVE_KEYWORDS.UNIVERSITY)
    ) {
      return;
    }

    // Skip remedial courses not owed by this student
    if (waivedRemedials.has(canon)) return;
    if (
      !precalcMandatory &&
      canon === SPECIAL_COURSES.PRECALCULUS &&
      !transcriptData.remedialCourses.includes("Precalculus")
    ) {
      return;
    }
    if (
      canon === SPECIAL_COURSES.REMEDIAL_ENGLISH &&
      !transcriptData.remedialCourses.includes("Remedial English")
    ) {
      return;
    }

    seenCodes.add(canon);

    // Already passed or currently taking this semester ("U")
    if (studiedSet.has(canon)) return;

    const cleanCode = course.code.replace(/\s*\*/g, "").trim();
    const cleanTitle = course.title.trim();
    const semester = planSemesters?.codeToSemester.get(canon) ?? 99;

    remainingCoreEntries.push({
      code: cleanCode,
      title: cleanTitle,
      semester,
      order: index,
    });
  });

  // Sort by official plan semester, preserving CSV order within the same semester
  remainingCoreEntries.sort(
    (a, b) => a.semester - b.semester || a.order - b.order
  );

  const remainingCourses: string[] = remainingCoreEntries.map(
    (c) => `${c.code} - ${c.title}`
  );

  // Include remaining Science / University elective slots (after current semester U)
  // since the form only has dedicated rows for Major Electives & Professional Training
  const remainingScienceAfterCurrent = Math.max(
    0,
    report.remainingScienceElectives - report.ungradedScienceElectives.length
  );
  if (remainingScienceAfterCurrent > 0) {
    remainingCourses.push(
      remainingScienceAfterCurrent === 1
        ? "Science Elective"
        : `Science Elective (${remainingScienceAfterCurrent} courses)`
    );
  }

  const remainingUniversityAfterCurrent = Math.max(
    0,
    report.remainingUniversityRequirements -
      report.ungradedUniversityRequirements.length
  );
  if (remainingUniversityAfterCurrent > 0) {
    remainingCourses.push(
      remainingUniversityAfterCurrent === 1
        ? "University Requirement Elective"
        : `University Requirement Elective (${remainingUniversityAfterCurrent} courses)`
    );
  }

  // Remaining Professional Training (getProfessionalTraining already counts Passing + U)
  const remainingProfCount = report.remainingProfessionalTraining;
  const remainingProfLines: string[] = [];

  if (remainingProfCount > 0) {
    const passingOrUngraded = new Set<string>([
      ...GRADES.PASSING,
      ...GRADES.UNGRADED,
    ]);
    const mobileAppsCode = canonicalizeCode(
      PROFESSIONAL_TRAINING_SEQUENCE[0].code
    );
    const hasMobileApps = transcriptData.courses.some(
      (c) =>
        canonicalizeCode(c.code) === mobileAppsCode &&
        passingOrUngraded.has(c.grade)
    );

    const trackDoneCount = transcriptData.courses.filter((c) => {
      const canon = canonicalizeCode(c.code);
      if (canon === canonicalizeCode(PRACTICAL_TRAINING_CODE)) return false;
      if (canon === mobileAppsCode) return false;
      if (canon.startsWith("UNR") || canon.startsWith("CNC")) return false;
      const isProf =
        canon.startsWith("CIT") ||
        c.title.includes(ELECTIVE_KEYWORDS.PROFESSIONAL) ||
        /Professional\s+Training/i.test(c.title);
      return isProf && passingOrUngraded.has(c.grade);
    }).length;

    const slots: string[] = [];
    if (!hasMobileApps && slots.length < remainingProfCount) {
      const first = PROFESSIONAL_TRAINING_SEQUENCE[0];
      slots.push(`${first.code} - ${first.title}`);
    }

    const trackSequence = PROFESSIONAL_TRAINING_SEQUENCE.slice(1);
    const neededTracks = remainingProfCount - slots.length;
    if (neededTracks > 0) {
      // Pick the next remaining track slots in order
      const startIdx = Math.min(
        trackDoneCount,
        Math.max(0, trackSequence.length - neededTracks)
      );
      for (let i = startIdx; i < trackSequence.length && slots.length < remainingProfCount; i++) {
        slots.push(trackSequence[i].title);
      }
    }

    remainingProfLines.push(
      `${remainingProfCount} remaining: ${slots.join(", ")}`
    );
  }

  // Taken Major Electives (completed + currently in-progress U, deduplicated by canonical code)
  const takenMajorMap = new Map<string, string>();
  for (const elective of report.completedMajorElectives) {
    const canon = canonicalizeCode(elective.code);
    if (!takenMajorMap.has(canon)) {
      takenMajorMap.set(canon, `${elective.code.trim()} - ${elective.title.trim()}`);
    }
  }
  for (const elective of report.ungradedMajorElectives) {
    const canon = canonicalizeCode(elective.code);
    if (!takenMajorMap.has(canon)) {
      takenMajorMap.set(
        canon,
        `${elective.code.trim()} - ${elective.title.trim()} (In Progress)`
      );
    }
  }
  const takenMajorElectives = Array.from(takenMajorMap.values());

  // Number of Remaining Majors (after current semester)
  const requirements = getElectiveRequirements(coursePlan);
  const numberOfRemainingMajors = Math.max(
    0,
    requirements.majorElectives - takenMajorMap.size
  );

  return {
    studentId: report.studentID || transcriptData.studentId || "",
    studentName: report.studentName || transcriptData.studentName || "",
    achievedCreditHoursAfterCurrent: report.expectedCreditHours,
    departmentCode,
    departmentDisplay,
    remainingCourses,
    remainingProfessionalTrainingCount: remainingProfCount,
    remainingProfessionalTrainingLines: remainingProfLines,
    numberOfRemainingMajors,
    takenMajorElectives,
  };
}

/**
 * Compute Pre-registration Form data for one student by loading their department plan.
 */
export async function buildPreRegistrationData(
  input: PreRegistrationStudentInput
): Promise<PreRegistrationFormData> {
  const { courses, planSemesters } = await getCachedDepartmentPlan(
    input.transcriptData.department
  );
  return computePreRegistrationData(input, courses, planSemesters);
}

/**
 * Compute Pre-registration Form data for a batch of students.
 */
export async function buildBatchPreRegistrationData(
  inputs: PreRegistrationStudentInput[]
): Promise<PreRegistrationFormData[]> {
  return Promise.all(inputs.map((input) => buildPreRegistrationData(input)));
}

// ---------------------------------------------------------------------------
// OOXML (.docx) template filling
// ---------------------------------------------------------------------------

/**
 * Escape text safely for XML 1.0 text nodes and strip illegal control characters.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function makeParaId(counter: { value: number }): string {
  counter.value += 1;
  return (0x10000000 + counter.value).toString(16).toUpperCase().padStart(8, "0");
}

function buildCellParagraphsXml(
  lines: string[],
  counter: { value: number }
): string {
  const rPr =
    '<w:rPr><w:rFonts w:asciiTheme="majorBidi" w:hAnsiTheme="majorBidi" w:cstheme="majorBidi"/><w:color w:val="000000"/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>';

  if (lines.length === 0) {
    return `<w:p w14:paraId="${makeParaId(counter)}" w14:textId="77777777"><w:pPr>${rPr}</w:pPr></w:p>`;
  }

  return lines
    .map((line) => {
      const escaped = escapeXml(line);
      return `<w:p w14:paraId="${makeParaId(counter)}" w14:textId="77777777"><w:pPr><w:spacing w:after="40" w:line="240" w:lineRule="auto"/>${rPr}</w:pPr><w:r>${rPr}<w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
    })
    .join("");
}

/**
 * Replace the paragraphs inside the second <w:tc> (value cell) of a <w:tr>,
 * keeping its <w:tcPr> intact.
 */
function fillTableRowValueCell(
  rowXml: string,
  lines: string[],
  counter: { value: number }
): string {
  // Match all <w:tc>...</w:tc> blocks inside the row (non-nested)
  const tcRegex = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
  const cells = [...rowXml.matchAll(tcRegex)];
  if (cells.length < 2) return rowXml;

  const valueCellMatch = cells[1];
  const valueCellXml = valueCellMatch[0];
  const tcPrMatch = valueCellXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/);
  const tcPr = tcPrMatch ? tcPrMatch[0] : '<w:tcPr><w:tcW w:w="6961" w:type="dxa"/></w:tcPr>';

  const newValueCell = `<w:tc>${tcPr}${buildCellParagraphsXml(lines, counter)}</w:tc>`;
  const start = valueCellMatch.index!;
  const end = start + valueCellXml.length;

  return rowXml.slice(0, start) + newValueCell + rowXml.slice(end);
}

/**
 * Ensure a table row has <w:cantSplit/> in <w:trPr> so rows do not split mid-cell across pages.
 */
function addCantSplitToRow(rowXml: string): string {
  if (rowXml.includes("<w:cantSplit")) return rowXml;
  if (rowXml.includes("<w:trPr>")) {
    return rowXml.replace("<w:trPr>", "<w:trPr><w:cantSplit/>");
  }
  return rowXml.replace(/(<w:tr\b[^>]*>)/, "$1<w:trPr><w:cantSplit/></w:trPr>");
}

/**
 * Re-assign all w14:paraId attributes in an XML fragment so cloned tables
 * never share duplicate paragraph IDs.
 */
function refreshParaIds(xml: string, counter: { value: number }): string {
  return xml.replace(/w14:paraId="[0-9A-Fa-f]+"/g, () => {
    return `w14:paraId="${makeParaId(counter)}"`;
  });
}

/**
 * Build one filled <w:tbl> element for a student from the template table XML.
 *
 * Template row mapping:
 *   0: ID
 *   1: Student Name
 *   2: Achieved Credit Hours (after the current semester)
 *   3: Department
 *   4: Remaining Courses
 *   5: Remaining Professional Training
 *   6: Number of Remaining Majors
 *   7: Taken Major Electives
 *   8: Number of Remaining Minors  -> intentionally left blank
 *   9: Taken Minor Electives       -> intentionally left blank
 */
function buildStudentTableXml(
  normalizedTableTemplate: string,
  student: PreRegistrationFormData,
  counter: { value: number }
): string {
  const rowValues: Record<number, string[]> = {
    0: [student.studentId],
    1: [student.studentName],
    2: [String(student.achievedCreditHoursAfterCurrent)],
    3: [student.departmentDisplay],
    4: student.remainingCourses.length > 0 ? student.remainingCourses : ["None"],
    5:
      student.remainingProfessionalTrainingLines.length > 0
        ? student.remainingProfessionalTrainingLines
        : ["None"],
    6: [String(student.numberOfRemainingMajors)],
    7:
      student.takenMajorElectives.length > 0
        ? student.takenMajorElectives
        : ["None"],
    // Rows 8 & 9 (Minor subjects) are deliberately omitted
  };

  let rowIdx = 0;
  const filledTable = normalizedTableTemplate.replace(
    /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g,
    (rowXml) => {
      const idx = rowIdx++;
      let updatedRow = addCantSplitToRow(rowXml);
      if (Object.prototype.hasOwnProperty.call(rowValues, idx)) {
        updatedRow = fillTableRowValueCell(updatedRow, rowValues[idx], counter);
      }
      return updatedRow;
    }
  );

  return refreshParaIds(filledTable, counter);
}

/**
 * Transform the template's word/document.xml by:
 * 1. Filling "Academic Advisor Name: <advisorName>"
 * 2. Converting the floating table to an inline centered table (prevents overlap
 *    when multiple tables appear in one document)
 * 3. Generating one filled Table 1 per student, separated by page breaks when
 *    multiple students are included in a single file.
 */
export function fillPreRegistrationDocumentXml(
  templateXml: string,
  students: PreRegistrationFormData[],
  advisorName: string
): string {
  if (students.length === 0) {
    throw new Error("At least one student is required to generate the form.");
  }

  const counter = { value: 0 };
  let xml = templateXml;

  // 1. Fill Academic Advisor Name in its paragraph
  const trimmedAdvisor = advisorName.trim();
  if (trimmedAdvisor) {
    const advisorParaRegex =
      /(<w:p\b[^>]*>(?:(?!<\/w:p>)[\s\S])*?Academic Advisor Name[\s\S]*?)(<\/w:p>)/;
    const advisorRun =
      `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="28"/><w:szCs w:val="28"/></w:rPr>` +
      `<w:t xml:space="preserve">${escapeXml(trimmedAdvisor)}</w:t></w:r>`;
    xml = xml.replace(advisorParaRegex, `$1${advisorRun}$2`);
  }

  // 2. Locate the template <w:tbl>...</w:tbl>
  const tblMatch = xml.match(/<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/);
  if (!tblMatch || tblMatch.index === undefined) {
    throw new Error("Could not find Table 1 in the pre-registration form template.");
  }

  // Convert floating <w:tblpPr> + <w:tblOverlap> to inline centered <w:jc w:val="center"/>
  // so multiple student tables flow cleanly without overlapping each other.
  let normalizedTableTemplate = tblMatch[0]
    .replace(/<w:tblpPr\b[^>]*\/>/g, '<w:jc w:val="center"/>')
    .replace(/<w:tblOverlap\b[^>]*\/>/g, "");

  if (!normalizedTableTemplate.includes("<w:jc ")) {
    normalizedTableTemplate = normalizedTableTemplate.replace(
      "</w:tblPr>",
      '<w:jc w:val="center"/></w:tblPr>'
    );
  }

  // 3. Build one filled table per student
  const tablesXml = students
    .map((student, idx) => {
      const tableXml = buildStudentTableXml(
        normalizedTableTemplate,
        student,
        counter
      );

      if (idx === 0) {
        return tableXml;
      }

      // Start each subsequent student cleanly on a new page with a subtle table caption
      const pageBreakPara =
        `<w:p w14:paraId="${makeParaId(counter)}" w14:textId="77777777">` +
        `<w:r><w:br w:type="page"/></w:r></w:p>`;
      const captionPara =
        `<w:p w14:paraId="${makeParaId(counter)}" w14:textId="77777777">` +
        `<w:pPr><w:spacing w:after="120"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/></w:rPr></w:pPr>` +
        `<w:r><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/></w:rPr>` +
        `<w:t xml:space="preserve">Table 1 Graduates (Student ${idx + 1} of ${students.length})</w:t></w:r></w:p>`;

      return pageBreakPara + captionPara + tableXml;
    })
    .join("");

  const tblStart = tblMatch.index;
  const tblEnd = tblStart + tblMatch[0].length;

  return xml.slice(0, tblStart) + tablesXml + xml.slice(tblEnd);
}

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Generate raw .docx bytes (Uint8Array) for one or more students.
 */
export async function generatePreRegistrationDocxBytes(
  templateBuffer: ArrayBuffer | Uint8Array,
  students: PreRegistrationFormData[],
  advisorName: string
): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(templateBuffer);
  const docFile = zip.file("word/document.xml");
  if (!docFile) {
    throw new Error("Invalid .docx template: missing word/document.xml");
  }

  const templateXml = await docFile.async("string");
  const updatedXml = fillPreRegistrationDocumentXml(
    templateXml,
    students,
    advisorName
  );

  zip.file("word/document.xml", updatedXml);

  return zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
}

/**
 * Generate a filled .docx Blob for one or more students (separate table per student).
 */
export async function generatePreRegistrationDocx(
  templateBuffer: ArrayBuffer | Uint8Array,
  students: PreRegistrationFormData[],
  advisorName: string
): Promise<Blob> {
  const bytes = await generatePreRegistrationDocxBytes(
    templateBuffer,
    students,
    advisorName
  );
  return new Blob([bytes.buffer as ArrayBuffer], { type: DOCX_MIME_TYPE });
}

/**
 * Build a safe filename stem for a student's Pre-registration Form.
 */
export function buildStudentFormFileName(student: {
  studentId: string;
  studentName: string;
}): string {
  const cleanId = (student.studentId || "student")
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, "");
  const cleanName = (student.studentName || "")
    .trim()
    .replace(/[^A-Za-z0-9\s_-]/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 60);

  const suffix = [cleanId, cleanName].filter(Boolean).join("_") || "student";
  return `Pre-registration_Form_${suffix}.docx`;
}

/**
 * Generate a ZIP archive containing an individual filled .docx file per student.
 */
export async function generatePreRegistrationIndividualZip(
  templateBuffer: ArrayBuffer | Uint8Array,
  students: PreRegistrationFormData[],
  advisorName: string
): Promise<Blob> {
  const archive = new JSZip();
  const usedNames = new Set<string>();

  for (const student of students) {
    const docxBytes = await generatePreRegistrationDocxBytes(
      templateBuffer,
      [student],
      advisorName
    );
    let fileName = buildStudentFormFileName(student);

    // Ensure unique filenames inside the ZIP even if duplicate IDs/names appear
    if (usedNames.has(fileName.toLowerCase())) {
      const base = fileName.replace(/\.docx$/i, "");
      let suffix = 2;
      while (usedNames.has(`${base}_${suffix}.docx`.toLowerCase())) {
        suffix += 1;
      }
      fileName = `${base}_${suffix}.docx`;
    }
    usedNames.add(fileName.toLowerCase());

    archive.file(fileName, docxBytes);
  }

  const zipBytes = await archive.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
  });
  return new Blob([zipBytes.buffer as ArrayBuffer], { type: "application/zip" });
}

/**
 * Trigger a browser file download for a Blob.
 */
export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Delay revoke slightly so Safari/Firefox finishes reading the object URL
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Download a filled Pre-registration Form (.docx) for a single student.
 */
export async function downloadSinglePreRegistrationForm(
  student: PreRegistrationFormData,
  advisorName: string
): Promise<string> {
  const templateBuffer = await fetchPreRegistrationTemplate();
  const blob = await generatePreRegistrationDocx(
    templateBuffer,
    [student],
    advisorName
  );
  const fileName = buildStudentFormFileName(student);
  triggerBlobDownload(blob, fileName);
  return fileName;
}

/**
 * Download one combined Pre-registration Form (.docx) containing a separate table
 * for every selected student.
 */
export async function downloadBatchCombinedPreRegistrationForm(
  students: PreRegistrationFormData[],
  advisorName: string
): Promise<string> {
  const templateBuffer = await fetchPreRegistrationTemplate();
  const blob = await generatePreRegistrationDocx(
    templateBuffer,
    students,
    advisorName
  );
  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileName = `Pre-registration_Form_Batch_${students.length}_Students_${dateStamp}.docx`;
  triggerBlobDownload(blob, fileName);
  return fileName;
}

/**
 * Download a .zip archive containing an individual filled .docx for each student.
 */
export async function downloadBatchIndividualPreRegistrationForms(
  students: PreRegistrationFormData[],
  advisorName: string
): Promise<string> {
  const templateBuffer = await fetchPreRegistrationTemplate();
  const blob = await generatePreRegistrationIndividualZip(
    templateBuffer,
    students,
    advisorName
  );
  const dateStamp = new Date().toISOString().slice(0, 10);
  const fileName = `Pre-registration_Forms_Individual_${students.length}_Students_${dateStamp}.zip`;
  triggerBlobDownload(blob, fileName);
  return fileName;
}
