import React from "react";
import Image from "next/image";
import ccitLogo from "@/lib/assets/ccit.png";
interface HeaderProps {
  advisorName?: string;
  onLogout?: () => void;
}

export function Header({ advisorName, onLogout }: HeaderProps = {}) {
    const headerStyle: React.CSSProperties = {
    backgroundColor: "rgb(7, 27, 82)", // Deep blue
    color: "rgb(255, 255, 255)",         // White text
    padding: "20px",

  };
  return (
    <header style={headerStyle}>
      <div className="container mx-auto px-4 py-6 ">
        <div className="flex items-center gap-3 flex-wrap">
          <Image
            src={ccitLogo}
            alt="CCIT logo"
            width={100}
            height={100}
            className="rounded bg-white p-1"
          />
      <div className="flex flex-col">
          <h1 className="text-3xl font-bold">ERSHAD</h1>
          <p className="text-blue-100 mt-1">
          Registration Advising Program - CCIT 
          </p>
          <p className="text-md mt-1 italic ">
          Work in Progress
          </p>
        </div>

      {advisorName && (
        <div className="ml-auto flex items-center gap-4">
          <span className="text-blue-100 text-sm">{advisorName}</span>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-1.5 text-sm rounded-lg border border-blue-200/60 text-white hover:bg-white/10 transition-colors"
            >
              Sign Out
            </button>
          )}
        </div>
      )}
      </div>

      </div>
    </header>
  );
}
