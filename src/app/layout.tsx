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
      <body className={`${inter.className} antialiased`}>
        {children}
        <footer  className="py-4 text-center text-md text-gray-400">
          v0.3.1+13
        </footer>
      </body>
    </html>
  );
}
