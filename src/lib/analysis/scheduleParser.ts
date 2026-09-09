/**
 * Timetable PDF Parser
 * Extracts group schedules from AAST Timetable PDF files using pdfjs-dist
 */

import { GroupSchedule, DayOfWeek, PeriodNumber, ScheduleSlot } from "@/types/schedule";
import { canonicalizeCode } from "@/lib/constants";

interface PositionedText {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const DAYS: DayOfWeek[] = ["Sa", "Su", "Mo", "Tu", "We", "Th"];

const DAY_ALIASES: Record<string, DayOfWeek> = {
  sa: "Sa",
  sat: "Sa",
  saturday: "Sa",
  su: "Su",
  sun: "Su",
  sunday: "Su",
  mo: "Mo",
  mon: "Mo",
  monday: "Mo",
  tu: "Tu",
  tue: "Tu",
  tuesday: "Tu",
  we: "We",
  wed: "We",
  wednesday: "We",
  th: "Th",
  thu: "Th",
  thursday: "Th",
};

// Course code pattern e.g. CCS1302, EBA1204, UNR2101, CIT3200, CSE2001, 1EBA0201, 2GLA0001
const COURSE_CODE_REGEX = /\b([1-2]?[A-Z]{2,4}\s*\d{3,4}[A-Z]?)\b/i;

// Group name pattern e.g. 2CS1, 2CS2-Science, 3CS12, 5SE4, 5IS, 8IS1
const GROUP_NAME_REGEX = /\b([1-8])([A-Za-z]{2,4})([0-9A-Za-z\-_]*)\b/;

/**
 * Parse an uploaded PDF timetable file
 */
export async function parseSchedulePDF(buffer: Buffer | ArrayBuffer): Promise<GroupSchedule[]> {
  try {
    const pdfjsLib = await import("pdfjs-dist");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

    const uint8Array = new Uint8Array(buffer);
    const loadingTask = pdfjsLib.getDocument({ data: uint8Array });
    const pdf = await loadingTask.promise;

    const parsedGroups: GroupSchedule[] = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const textContent = await page.getTextContent();

      const items: PositionedText[] = textContent.items
        .filter((item): item is Extract<typeof item, { str: string }> => "str" in item && item.str.trim().length > 0)
        .map((item) => ({
          str: item.str.trim(),
          x: item.transform[4],
          // PDF y=0 is bottom; convert to top=0 for easier intuitive math
          y: viewport.height - item.transform[5],
          width: item.width,
          height: item.height,
        }));

      const groupSchedule = parsePageSchedule(items, viewport.width, viewport.height);
      if (groupSchedule && groupSchedule.courses.length > 0) {
        parsedGroups.push(groupSchedule);
      }
    }

    return parsedGroups;
  } catch (err) {
    console.error("Failed to parse schedule PDF:", err);
    throw err;
  }
}

/**
 * Parse a single timetable page
 */
function parsePageSchedule(
  items: PositionedText[],
  pageWidth: number,
  pageHeight: number
): GroupSchedule | null {
  // 1. Find group name
  let detectedGroupName: string | null = null;
  let semester = 0;
  let department = "";
  let subGroup = "";

  // The group name usually appears in the upper 25% of the page
  const headerItems = items.filter((it) => it.y < pageHeight * 0.28);
  for (const it of headerItems) {
    const match = it.str.match(GROUP_NAME_REGEX);
    if (match) {
      // Must not match building or date strings
      const raw = match[0];
      if (/college|academy|timetables|cairo|street/i.test(raw)) continue;
      detectedGroupName = raw;
      semester = parseInt(match[1], 10);
      department = match[2].toUpperCase();
      subGroup = match[3] || "";
      break;
    }
  }

  if (!detectedGroupName) {
    return null;
  }

  // 2. Identify day rows
  // Find items matching day names (Sa, Su, Mo, Tu, We, Th) on the left side (x < pageWidth * 0.2)
  const dayItems: { day: DayOfWeek; y: number }[] = [];
  for (const it of items) {
    if (it.x < pageWidth * 0.18) {
      const lower = it.str.toLowerCase();
      if (DAY_ALIASES[lower]) {
        dayItems.push({ day: DAY_ALIASES[lower], y: it.y });
      }
    }
  }

  // If days couldn't be located on the left, fall back to standard spacing in 6 equal vertical bands
  const dayRowBounds: { day: DayOfWeek; minY: number; maxY: number }[] = [];
  if (dayItems.length >= 4) {
    // Sort by y coordinate (top to bottom)
    dayItems.sort((a, b) => a.y - b.y);
    for (let i = 0; i < dayItems.length; i++) {
      const current = dayItems[i];
      const prevY = i === 0 ? current.y - 30 : (dayItems[i - 1].y + current.y) / 2;
      const nextY = i === dayItems.length - 1 ? current.y + 45 : (current.y + dayItems[i + 1].y) / 2;
      dayRowBounds.push({
        day: current.day,
        minY: prevY,
        maxY: nextY,
      });
    }
  } else {
    // Fallback: divide grid vertically from y = 0.28 to y = 0.95 into 6 rows
    const gridTop = pageHeight * 0.28;
    const gridBottom = pageHeight * 0.95;
    const rowHeight = (gridBottom - gridTop) / 6;
    DAYS.forEach((day, idx) => {
      dayRowBounds.push({
        day,
        minY: gridTop + idx * rowHeight,
        maxY: gridTop + (idx + 1) * rowHeight,
      });
    });
  }

  // 3. Identify period columns (1 to 6)
  // Look for header markers "1", "2", "3", "4", "5", "6" or time strings in y between 0.15 and 0.30
  const periodCols: { period: PeriodNumber; minX: number; maxX: number }[] = [];
  // Grid typically occupies x from ~0.12 * pageWidth to ~0.98 * pageWidth
  const gridLeft = pageWidth * 0.12;
  const gridRight = pageWidth * 0.98;
  const colWidth = (gridRight - gridLeft) / 6;

  for (let p = 1; p <= 6; p++) {
    periodCols.push({
      period: p as PeriodNumber,
      minX: gridLeft + (p - 1) * colWidth,
      maxX: gridLeft + p * colWidth,
    });
  }

  // 4. Map content items into cells (day, period)
  const cellTexts = new Map<string, string[]>();

  for (const it of items) {
    // Find matching day
    const row = dayRowBounds.find((r) => it.y >= r.minY && it.y < r.maxY);
    if (!row) continue;

    // Find matching period column
    const col = periodCols.find((c) => it.x + it.width / 2 >= c.minX && it.x + it.width / 2 < c.maxX);
    if (!col) continue;

    const cellKey = `${row.day}_${col.period}`;
    if (!cellTexts.has(cellKey)) {
      cellTexts.set(cellKey, []);
    }
    cellTexts.get(cellKey)!.push(it.str);
  }

  // 5. Extract courses per cell
  const courseMap = new Map<string, { code: string; title: string; slots: ScheduleSlot[] }>();

  cellTexts.forEach((textList, cellKey) => {
    const [dayStr, periodStr] = cellKey.split("_");
    const day = dayStr as DayOfWeek;
    const period = parseInt(periodStr, 10) as PeriodNumber;

    const fullCell = textList.join(" ");
    const match = fullCell.match(COURSE_CODE_REGEX);
    if (!match) return;

    const rawCode = match[1];
    const cleanCode = canonicalizeCode(rawCode);

    // Try extracting title (after "/" or remaining text)
    let title = "";
    if (fullCell.includes("/")) {
      const parts = fullCell.split("/");
      title = parts.slice(1).join("/").trim();
    } else {
      title = fullCell.replace(rawCode, "").trim();
    }

    if (!courseMap.has(cleanCode)) {
      courseMap.set(cleanCode, {
        code: cleanCode,
        title: title || cleanCode,
        slots: [],
      });
    }

    // Add this slot
    courseMap.get(cleanCode)!.slots.push({ day, period });
  });

  return {
    groupName: detectedGroupName,
    semester,
    department,
    subGroup,
    courses: Array.from(courseMap.values()),
  };
}
