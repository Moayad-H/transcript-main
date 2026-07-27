import React from "react";
import Image from "next/image";
import ccitLogo from "@/lib/assets/ccit.png";

interface HeaderProps {
  advisorName?: string;
  onLogout?: () => void;
  /**
   * Slim variant used by the report dashboard, where every row of header is a
   * row the advisor loses off the board.
   */
  compact?: boolean;
}

export function Header({ advisorName, onLogout, compact = false }: HeaderProps = {}) {
  return (
    <header
      className={`flex-shrink-0 bg-brand text-white print:hidden ${
        compact ? "px-4 py-2" : "px-5 py-5"
      }`}
    >
      <div
        className={
          compact
            ? "flex items-center gap-3"
            : "container mx-auto flex flex-wrap items-center gap-3 px-4 py-6"
        }
      >
        <Image
          src={ccitLogo}
          alt="CCIT logo"
          width={compact ? 40 : 100}
          height={compact ? 40 : 100}
          className="rounded bg-white p-1"
        />
        <div className="flex flex-col">
          <h1 className={compact ? "text-xl font-bold leading-tight" : "text-3xl font-bold"}>
            ERSHAD
          </h1>
          {compact ? (
            <p className="text-[11px] text-blue-200">
              Registration Advising Program · CCIT · Work in Progress
            </p>
          ) : (
            <>
              <p className="mt-1 text-blue-100">
                Registration Advising Program - CCIT
              </p>
              <p className="mt-1 text-md italic">Work in Progress</p>
            </>
          )}
        </div>

        {advisorName && (
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-blue-100">{advisorName}</span>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="rounded-lg border border-blue-200/60 px-3 py-1.5 text-sm text-white transition-colors hover:bg-white/10"
              >
                Sign Out
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
