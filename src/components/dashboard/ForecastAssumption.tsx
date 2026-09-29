"use client";

import type { ReactNode } from "react";
import { track } from "@/lib/analytics/track";

// Annahmen der Quartalsprognose zum Aufklappen. <details> braucht kein JavaScript und ist per Tastatur bedienbar;
// das Ereignis zählt nur, dass jemand die Rechnung ansieht – keine Zahlen, keine IDs.
export function ForecastAssumption({ children }: { children: ReactNode }) {
  return (
    <details
      className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
      onToggle={(e) => {
        if (e.currentTarget.open) track("dashboard_forecast_viewed");
      }}
    >
      <summary className="min-h-11 cursor-pointer py-3.5 font-medium text-foreground md:min-h-0 md:py-0">So kommt die Prognose zustande</summary>
      <div className="mt-2 space-y-1">{children}</div>
    </details>
  );
}
