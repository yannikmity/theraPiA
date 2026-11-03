"use client";

import Link from "next/link";
import { BookOpen, Plus } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { track, type QuickCaptureSource, type QuickCaptureType } from "@/lib/analytics/track";
import { cn } from "@/lib/utils";
import type { PatientId } from "@/types";

interface QuickCaptureLinkProps {
  patientId: PatientId | string;
  /** Für die Beschriftung (aria-label) – erscheint nicht in der Statistik. */
  chiffre: string;
  source: QuickCaptureSource;
  /** Therapie-Erfassung („+ Sitzung“, Vorgabe) oder Supervision mit dieser Patient:in als besprochenem Fall (#77). */
  type?: QuickCaptureType;
  /** Nur das Plus (Listenzeilen, 44 px Ziel am Handy, 40 px ab md); sonst Knopf mit Text „Sitzung“ (gleiche Höhen). */
  compact?: boolean;
  className?: string;
}

// Schnelleinstieg „+ Sitzung“ (#5) bzw. „Supervision“ (#77): öffnet das Erfassen-Formular mit vorgewählter Patient:in.
// An die Statistik geht nur, von wo (Dashboard oder Patient:innen-Seite) und was – keine Chiffre, keine ID.
export function QuickCaptureLink({
  patientId,
  chiffre,
  source,
  type = "therapie",
  compact = false,
  className,
}: QuickCaptureLinkProps) {
  const supervision = type === "supervision";
  const Icon = supervision ? BookOpen : Plus;
  return (
    <Link
      href={supervision ? `/sessions/new?type=supervision&patient=${patientId}` : `/sessions/new?patient=${patientId}`}
      aria-label={`${supervision ? "Supervision" : "Sitzung"} für ${chiffre} erfassen`}
      onClick={() => track("quick_capture_used", { source, type })}
      className={cn(
        buttonVariants({ variant: compact ? "ghost" : supervision ? "outline" : "success", size: compact ? "icon" : "default" }),
        compact && "size-11 text-primary hover:bg-primary-soft hover:text-primary md:size-10",
        className
      )}
    >
      <Icon aria-hidden="true" />
      {!compact && (supervision ? "Supervision" : "Sitzung")}
    </Link>
  );
}
