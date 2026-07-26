"use client";

import React, { useState } from "react";
import Image from "next/image";
import ccitLogo from "@/lib/assets/ccit.png";
import { verifyAdvisor } from "@/lib/auth/supabase";
import type { AdvisorSession } from "@/lib/auth/session";

interface LoginScreenProps {
  onLogin: (advisor: AdvisorSession) => void;
}

export function LoginScreen({ onLogin }: LoginScreenProps) {
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedId = staffId.trim();
    if (!trimmedId || !password) {
      setError("Enter both your staff ID and the password.");
      return;
    }

    setLoading(true);
    try {
      // Both the ID and the password are checked server-side, in one call.
      const instructor = await verifyAdvisor(trimmedId, password);

      if (!instructor) {
        setError("Incorrect staff ID or password.");
        return;
      }

      onLogin(instructor);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not sign in. Try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Image
            src={ccitLogo}
            alt="CCIT logo"
            width={110}
            height={110}
            className="rounded bg-white p-2 shadow-sm"
          />
          <h1
            className="text-3xl font-bold mt-4"
            style={{ color: "rgb(7, 27, 82)" }}
          >
            ERSHAD
          </h1>
          <p className="text-gray-600 mt-1 text-center">
            Registration Advising Program - CCIT
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-xl shadow-md p-8 space-y-5"
        >
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Advisor Sign In</h2>
            <p className="text-sm text-gray-500 mt-1">
              Use your staff portal ID.
            </p>
          </div>

          <div>
            <label
              htmlFor="staffId"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Staff ID
            </label>
            <input
              id="staffId"
              name="staffId"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              autoFocus
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              placeholder="e.g. 7435"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: "rgb(7, 27, 82)" }}
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-500 mt-6">
          CCIT - College of Computing and Information Technology - Cairo
        </p>
      </div>
    </div>
  );
}
