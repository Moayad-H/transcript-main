import { ReactNode } from "react";

interface ReportSectionProps {
  title: string;
  badge?: string | number;
  badgeColor?:
    | "blue"
    | "green"
    | "yellow"
    | "red"
    | "purple"
    | "indigo"
    | "orange";
  children: ReactNode;
}

const badgeColors = {
  blue: "bg-blue-100 text-blue-800",
  green: "bg-green-100 text-green-800",
  yellow: "bg-yellow-100 text-yellow-800",
  red: "bg-red-100 text-red-800",
  purple: "bg-purple-100 text-purple-800",
  indigo: "bg-indigo-100 text-indigo-800",
  orange: "bg-orange-100 text-orange-800",
};

export function ReportSection({
  title,
  badge,
  badgeColor = "blue",
  children,
}: ReportSectionProps) {
  return (
    <div className="border-b border-gray-200 pb-6 last:border-0">
      <div className="flex items-center gap-3 mb-4">
        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
        {badge !== undefined && (
          <span
            className={`px-3 py-1 rounded-full text-sm font-semibold ${badgeColors[badgeColor]}`}
          >
            {badge}
          </span>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}
