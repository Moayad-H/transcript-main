'use client';

import { useState } from 'react';
import { StudiedCourse, TranscriptData } from '@/types';
import { createTranscriptFromManualEntry } from '@/lib/analysis/clientParser';

interface ManualEntryFormProps {
  onSubmit: (data: TranscriptData) => void;
  onBack: () => void;
}

export function ManualEntryForm({ onSubmit, onBack }: ManualEntryFormProps) {
  const [courseInput, setCourseInput] = useState('');
  const [courses, setCourses] = useState<StudiedCourse[]>([]);

  const handleAddCourse = () => {
    // Parse format: CODE|TITLE|GRADE (e.g., CCS1101|Introduction to Computing|A)
    const lines = courseInput.trim().split('\n');
    const newCourses: StudiedCourse[] = [];

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 3) {
        newCourses.push({
          code: parts[0].trim(),
          title: parts[1].trim(),
          grade: parts[2].trim(),
        });
      }
    }

    setCourses([...courses, ...newCourses]);
    setCourseInput('');
  };

  const handleSubmit = () => {
    if (courses.length > 0) {
      const transcriptData = createTranscriptFromManualEntry(courses);
      onSubmit(transcriptData);
    }
  };

  const handleRemoveCourse = (index: number) => {
    setCourses(courses.filter((_, i) => i !== index));
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Manual Course Entry
        </h2>
        <p className="text-gray-600 mb-6">
          PDF parsing requires server-side processing. Enter your courses manually using the format below.
        </p>

        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm font-medium text-blue-800 mb-2">Format (one per line):</p>
          <code className="text-xs text-blue-700">CODE|TITLE|GRADE</code>
          <p className="text-xs text-blue-600 mt-2">Example:</p>
          <code className="text-xs text-blue-700">
            CCS1101|Introduction to Computing|A<br />
            EBA1203|Calculus I|B+<br />
            UNR1403|Academic English|A
          </code>
        </div>

        <textarea
          value={courseInput}
          onChange={(e) => setCourseInput(e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm h-40 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          placeholder="CCS1101|Introduction to Computing|A"
        />

        <button
          onClick={handleAddCourse}
          className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Add Courses
        </button>

        {courses.length > 0 && (
          <div className="mt-6">
            <h3 className="font-semibold text-gray-800 mb-3">
              Entered Courses ({courses.length}):
            </h3>
            <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
              {courses.map((course, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 border-b last:border-0 hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                      {course.code}
                    </span>
                    <span className="ml-3 text-gray-700">{course.title}</span>
                    <span className="ml-3 font-semibold text-blue-600">
                      {course.grade}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveCourse(idx)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-4">
          <button
            onClick={onBack}
            className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={courses.length === 0}
            className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            Continue ({courses.length} courses)
          </button>
        </div>
      </div>
    </div>
  );
}
