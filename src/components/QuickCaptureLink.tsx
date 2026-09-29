"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { track, type QuickCaptureSource } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";
import type { PatientId } from "@/types";

interface QuickCaptureLinkProps {
  patientId: PatientId | string;
  /** Für die Beschriftung (aria-label) – erscheint nicht in der Statistik. */
  chiffre: string;
  source: QuickCaptureSource;
  /** Nur das Plus (Listenzeilen, 44 px Ziel am Handy, 40 px ab md); sonst Knopf mit Text „Sitzung“ (gleiche Höhen). */
  compact?: boolean;
  className?: string;
}

// Schnelleinstieg „+ Sitzung“ (#5): öffnet das Erfassen-Formular mit vorgewählter Patient:in. An die Statistik
// geht nur, von wo (Dashboard oder Patient:innen-Seite) – keine Chiffre, keine ID.
export function QuickCaptureLink({ patientId, chiffre, source, compact = false, className }: QuickCaptureLinkProps) {
  return (
    <Link
      href={`/sessions/new?patient=${patientId}`}
      aria-label={`Sitzung für ${chiffre} erfassen`}
      onClick={() => track("quick_capture_used", { source })}
      className={cn(
        buttonVariants({ variant: compact ? "ghost" : "success", size: compact ? "icon" : "default" }),
        compact && "size-11 text-primary hover:bg-primary-soft hover:text-primary md:size-10",
        className
      )}
    >
      <Plus aria-hidden="true" />
      {!compact && "Sitzung"}
    </Link>
  );
}
