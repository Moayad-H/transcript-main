import React from "react";
import Image from "next/image";
import ccitLogo from "@/lib/assets/ccit.png";
export function Header() {
    const headerStyle: React.CSSProperties = {
    backgroundColor: "rgb(7, 27, 82)", // Deep blue
    color: "rgb(255, 255, 255)",         // White text
    padding: "20px",

  };
  return (
    <header style={headerStyle}>
      <div className="container mx-auto px-4 py-6 ">
        <div className="flex items-center gap-3">
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
      </div>
        
      </div>
    </header>
  );
}
