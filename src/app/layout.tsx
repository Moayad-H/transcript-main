import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CCIT (Transcripts)",
  description:
    "Student Registration Advising Program for CCIT - College of Computing and Information Technology",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      {/* Column layout so a screen can claim the leftover viewport height
          (the cockpit report view does) without magic pixel offsets. */}
      <body className={`${inter.className} antialiased flex min-h-screen flex-col`}>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        <footer className="flex-shrink-0 py-4 text-center text-md text-gray-400 print:hidden">
          v0.5.4 +28
        </footer>
      </body>
    </html>
  );
}
