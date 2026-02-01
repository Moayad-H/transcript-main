# ERSHAD2 Course Display Rules

## WHAT TO DISPLAY

### 1. UNGRADED COURSES (Grade = "U")

**Rule:** Show courses where student registered but no grade assigned yet

- **Display:** Course code + title
- **Logic:** Filter transcript courses where grade == "U"
- **Purpose:** Student needs to complete these or wait for grading

### 2. AVAILABLE COURSES (Can Register Now)

**Rule:** Courses from plan that student can take in next semester

- **Display:** Course code + title
- **Must Meet ALL Conditions:**
  - ✅ NOT already completed (not in transcript)
  - ✅ Prerequisites satisfied (all prereq courses passed OR credit hours met)
  - ✅ NOT an elective placeholder (Science/Major/University/Professional Training)
  - ✅ Remedial courses logic:
    - Skip Precalculus if already passed
    - Skip Remedial English if already passed
    - Skip UNR1403 if Remedial English still required
    - Skip Calculus I (EBA1203) if Precalculus still required

### 3. COMPLETED MAJOR ELECTIVES

**Rule:** Courses from Major Electives CSV that student already took

- **Display:** Course code + title
- **Logic:** Match transcript codes with Major {DEPT}.csv codes
- **Show Remaining:** Required count - completed count

### 4. COMPLETED SCIENCE ELECTIVES

**Rule:** Courses from science.csv that student already took

- **Display:** Course code + title
- **Logic:** Match transcript codes with science.csv codes
- **Exclude:** Any science course that's also in core plan
- **Show Remaining:** Required count - completed count

### 5. COMPLETED UNIVERSITY REQUIREMENTS

**Rule:** Courses from university.csv that student already took

- **Display:** Course code + title
- **Logic:** Match transcript codes with university.csv codes
- **Exclude:** Any university course that's also in core plan
- **Show Remaining:** Required count - completed count

### 6. COMPLETED PROFESSIONAL TRAINING

**Rule:** Courses with "Professional Training" in title

- **Display:** Course title only (no code)
- **Logic:** Filter transcript where title contains "Professional Training"
- **Show Remaining:** Required count - completed count
- **Note:** These don't count toward credit hours

### 7. OUT-OF-PLAN COURSES

**Rule:** Courses student took but NOT in any official plan/electives

- **Display:** Course code + title
- **Logic:** Find transcript courses that are NOT in:
  - Core course plan
  - Major electives
  - Science electives
  - University electives
- **Exclude:** Courses starting with "IT" prefix
- **Purpose:** Warn about irrelevant courses

---

## COURSE FILTERING RULES

### What NOT to Display in "Available Courses"

```
❌ Already completed (in transcript)
❌ Title contains "Science Elective" → Student picks from science.csv
❌ Title contains "Major Elective" → Student picks from Major CSV
❌ Title contains "University Requirement" → Student picks from university.csv
❌ Title contains "Professional Training" → Special handling
❌ Prerequisites not met → Check:
   - Missing prerequisite courses
   - Insufficient credit hours (for "30 CR or more" type prereqs)
❌ Remedial conflicts:
   - Precalculus offered only if failed/withdrawn before
   - Remedial English offered only if failed/withdrawn before
   - UNR1403 blocked if Remedial English needed
   - Calculus I blocked if Precalculus needed
```

### Prerequisite Check Logic

```
IF prereq == "-" OR empty:
  ✅ Can take (no prerequisites)

IF prereq contains "CR" (e.g., "30 CR or more"):
  IF student's credit hours >= required:
    ✅ Can take
  ELSE:
    ❌ Cannot take (need more credit hours)

IF prereq is course code(s) (e.g., "EBA1203,EBA1204"):
  IF ALL prereq courses in transcript:
    ✅ Can take
  ELSE:
    ❌ Cannot take (missing: list of missing courses)
```

### Failed/Withdrawn Course Handling

```
IF course has grade "F" OR "W":
  ❌ Exclude from valid courses

  IF course is "Precalculus":
    - Mark "needs Precalculus remedial"
    - Show Precalculus in available courses

  IF course is "Remedial English":
    - Mark "needs Remedial English"
    - Show Remedial English in available courses

IF course has grade "P" (Pass):
  ✅ Include as completed

  IF course is "Precalculus":
    - Unmark "needs Precalculus"
    - Don't show Precalculus in available

  IF course is "Remedial English":
    - Unmark "needs Remedial English"
    - Don't show Remedial English in available

⚠️ IMPORTANT: If "Remedial English" or "Precalculus" were NEVER in transcript:
  → Don't add them to "Courses You Can Register"
  → Only show remedial courses if student actually failed/withdrew them
```

---

## ELECTIVE COUNTING RULES

### How to Count Required Electives

```
FROM department's course plan CSV:

FOR each course in {DEPT} Courses.csv:
  IF title contains "Professional Training":
    required_professional_training++

  IF title contains "Science Elective":
    required_science_electives++

  IF title contains "Major Elective":
    required_major_electives++

  IF title contains "University Requirement":
    required_university_requirements++
```

### Remaining Calculation

```
remaining = MAX(0, required - completed)

Examples:
- Required 3 major electives, completed 1 → Remaining: 2
- Required 2 science electives, completed 2 → Remaining: 0
- Required 4 professional training, completed 5 → Remaining: 0 (not negative)
```

---

## DISPLAY SECTIONS

### Section 1: Ungraded Subjects

- **When Empty:** "No ungraded courses"
- **Purpose:** Remind student to check grades or complete exams

### Section 2: Courses You Can Register

- **When Empty:** "No available courses at this time"
- **Purpose:** Show what to register for next semester
- **Most Important:** This guides next semester registration

### Section 3: Major Electives

- **When Empty:** "No major electives completed yet"
- **Shows:** What student picked + how many more needed
- **Student Action:** Pick from Major {DEPT}.csv list

### Section 4: Science Electives

- **When Empty:** "No science electives completed yet"
- **Shows:** What student picked + how many more needed
- **Student Action:** Pick from science.csv list

### Section 5: University Requirements

- **When Empty:** "No university requirements completed yet"
- **Shows:** What student picked + how many more needed
- **Student Action:** Pick from university.csv list

### Section 6: Professional Training

- **When Empty:** "No professional training completed yet"
- **Shows:** Titles only (no course codes)
- **Note:** Don't count toward 132 credit hours

### Section 7: Out-of-Plan Courses

- **When Empty:** "None"
- **Purpose:** Warning that these courses don't count toward graduation
- **Example:** Taking CS course when in SE major

---

## KEY DECISION LOGIC

```
Q: Should I show course XYZ in "Available Courses"?

1. Is it already in transcript? → NO (already done)
2. Is it an elective placeholder? → NO (student picks separately)
3. Are prerequisites met? → Check all prereqs
4. Is it a remedial course? → Check if student needs it
5. All checks pass? → YES, show it
```

```
Q: Is course ABC an "out-of-plan" course?

1. Is it in {DEPT} Courses.csv? → NO (it's in plan)
2. Is it in Major {DEPT}.csv? → NO (it's a valid major elective)
3. Is it in science.csv? → NO (it's a valid science elective)
4. Is it in university.csv? → NO (it's a valid university req)
5. Does code start with "IT"? → NO (IT courses excluded)
6. All checks fail? → YES, it's out-of-plan
```
