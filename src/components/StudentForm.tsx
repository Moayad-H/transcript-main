"use client";

import { useState } from "react";
import { Department } from "@/types";
import { DEPARTMENTS, DEPARTMENT_NAMES } from "@/lib/constants";

interface StudentFormProps {
  onSubmit: (studentName: string, department: Department) => void;
  loading: boolean;
  onBack: () => void;
}

export function StudentForm({ onSubmit, loading, onBack }: StudentFormProps) {
  const [studentName, setStudentName] = useState("");
  const [department, setDepartment] = useState<Department>("CS");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (studentName.trim()) {
      onSubmit(studentName.trim(), department);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Student Information
        </h2>
        <p className="text-gray-600 mb-6">
          Please provide your name and select your department
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="studentName"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Student Name or ID
            </label>
            <input
              type="text"
              id="studentName"
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 placeholder:text-gray-400"
              placeholder="Enter your name or student ID"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label
              htmlFor="department"
              className="block text-sm font-medium text-gray-700 mb-2"
            >
              Department
            </label>
            <select
              id="department"
              value={department}
              onChange={(e) => setDepartment(e.target.value as Department)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900"
              required
              disabled={loading}
            >
              {DEPARTMENTS.map((dept) => (
                <option key={dept} value={dept}>
                  {dept} - {DEPARTMENT_NAMES[dept]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-4">
            <button
              type="button"
              onClick={onBack}
              disabled={loading}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 disabled:bg-gray-100 disabled:cursor-not-allowed transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={loading || !studentName.trim()}
              className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Generating Report..." : "Generate Report"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
