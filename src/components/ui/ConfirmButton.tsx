"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ConfirmButtonProps {
  /** Inhalt des Auslösers, z. B. „Löschen“ oder ein Icon. Bei reinem Icon ariaLabel setzen. */
  label?: React.ReactNode;
  ariaLabel?: string;
  /** Frage in der Nachfrage, z. B. „Sitzung wirklich löschen?“ */
  question: string;
  /** Folgen der Aktion, z. B. „Die Zuordnung zur Supervision wird entfernt.“ */
  description?: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
  loading?: boolean;
  disabled?: boolean;
  /** Klassen des Auslösers im Ruhezustand (z. B. Icon-Button: "size-8 text-muted-foreground hover:text-destructive") */
  className?: string;
}

// Inline-Nachfrage statt window.confirm: blockiert keine Automatisierung, ist auf dem Handy
// bedienbar, lässt sich mit Escape oder „Abbrechen“ verwerfen. Geöffnet nimmt die Komponente
// mit basis-full eine eigene Zeile ein, wenn das Elternelement flex-wrap ist.
export function ConfirmButton({
  label,
  ariaLabel,
  question,
  description,
  confirmLabel = "Ja, löschen",
  onConfirm,
  loading = false,
  disabled = false,
  className = "",
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (armed) confirmRef.current?.focus();
  }, [armed]);

  // finally: auch wenn onConfirm fehlschlägt, bleibt die Nachfrage nicht offen stehen.
  async function handleConfirm() {
    try {
      await onConfirm();
    } finally {
      setArmed(false);
    }
  }

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        disabled={disabled || loading}
        aria-label={ariaLabel}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0",
          className
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      role="group"
      aria-label={question}
      onKeyDown={(e) => {
        if (e.key === "Escape") setArmed(false);
      }}
      className="basis-full space-y-2 rounded-lg border border-destructive/40 bg-destructive-soft p-3"
    >
      <p className="text-sm font-medium text-destructive">{question}</p>
      {description && <p className="text-xs text-destructive">{description}</p>}
      <div className="flex gap-2">
        <Button
          ref={confirmRef}
          type="button"
          variant="destructive"
          size="sm"
          className="flex-1"
          onClick={handleConfirm}
          loading={loading}
        >
          {confirmLabel}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setArmed(false)}
          disabled={loading}
        >
          Abbrechen
        </Button>
      </div>
    </div>
  );
}
