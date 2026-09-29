"use client";

import { RatioResult } from "@/lib/calculations";
import { CheckCircle, AlertTriangle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDecimal } from "@/lib/csv";
import { formatVerhaeltnis } from "@/lib/format";

interface RatioIndicatorProps {
  ratio: RatioResult;
  compact?: boolean;
}

export default function RatioIndicator({ ratio, compact = false }: RatioIndicatorProps) {
  const config = {
    ok: {
      icon: CheckCircle,
      color: "text-success",
      box: "border-success/40 bg-success-soft",
      badge: "success-soft" as const,
      label: "Passt",
    },
    warning: {
      icon: AlertTriangle,
      color: "text-warning",
      box: "border-warning/40 bg-warning-soft",
      badge: "warning-soft" as const,
      label: "Knapp",
    },
    critical: {
      icon: XCircle,
      color: "text-destructive",
      box: "border-destructive/40 bg-destructive-soft",
      badge: "destructive-soft" as const,
      label: "Supervision fehlt",
    },
  }[ratio.status];

  const Icon = config.icon;
  const ratioText = ratio.ratio === Infinity ? "?" : formatDecimal(ratio.ratio, 1);

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 ${config.color}`}>
        <Icon size={14} aria-hidden="true" />
        <span className="text-xs font-medium">1:{ratioText}</span>
      </span>
    );
  }

  return (
    <div className={`flex items-center gap-3 rounded-xl border p-3 ${config.box}`}>
      <Icon size={24} className={`shrink-0 ${config.color}`} aria-hidden="true" />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`font-semibold ${config.color}`}>
            Verhältnis: <span className="whitespace-nowrap">1 : {ratioText}</span>
          </span>
          <Badge variant={config.badge}>{config.label}</Badge>
        </div>
        <p className="mt-0.5 hyphens-auto text-xs text-muted-foreground">
          {formatDecimal(ratio.supervisionHours, 1)} SV-Einheiten / {formatDecimal(ratio.therapyHours, 1)} Behandlungsstunden (Soll: 1:{formatVerhaeltnis(ratio.soll)})
        </p>
      </div>
    </div>
  );
}
