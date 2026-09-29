"use client";

import { formatDecimal } from "@/lib/csv";

interface ProgressBarProps {
  current: number;
  target: number;
  label: string;
  color?: "blue" | "green";
}

export default function ProgressBar({ current, target, label, color = "blue" }: ProgressBarProps) {
  const pct = Math.min((current / target) * 100, 100);
  const barColor = color === "green" ? "bg-success" : "bg-primary";
  const trackColor = color === "green" ? "bg-success-soft" : "bg-primary-soft";

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="min-w-0 text-sm font-medium text-foreground">{label}</span>
        <span className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{formatDecimal(current, 1)}</span>
          <span> / {target}</span>
          <span className="ml-1 text-xs">({pct.toFixed(0)}%)</span>
        </span>
      </div>
      <div
        className={`h-3 overflow-hidden rounded-full ${trackColor}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(current, target)}
      >
        <div className={`h-full rounded-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
