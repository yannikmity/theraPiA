"use client";

import { Label } from "@/components/ui/label";

interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

// Id der Fehlerzeile zu einem Feld: das Feld verweist mit aria-describedby darauf, damit Screenreader die Meldung
// zusammen mit dem Feld lesen (#47, #28).
export const fieldErrorId = (htmlFor: string) => `${htmlFor}-fehler`;

export function FormField({ label, error, children, htmlFor }: FormFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && (
        <p id={htmlFor ? fieldErrorId(htmlFor) : undefined} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
