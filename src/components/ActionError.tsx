"use client";

import { ActionResult } from "@/lib/action-result";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Fehler einer bestimmten Stelle: `scope` benennt die Aktion (z. B. "antrag", `session:${id}`), damit die Meldung dort
// erscheint, wo geklickt wurde – nicht oben auf der Seite außerhalb des sichtbaren Bereichs (#28).
export interface ScopedActionError {
  scope: string;
  result: ActionResult<unknown>;
}

export function errorAt(error: ScopedActionError | null, scope: string): ActionResult<unknown> | null {
  return error !== null && error.scope === scope ? error.result : null;
}

interface ActionErrorProps {
  result: ActionResult<unknown> | null;
}

export function ActionError({ result }: ActionErrorProps) {
  if (!result || result.success) return null;

  return (
    <Alert variant="destructive">
      <AlertDescription>
        <p>{result.error}</p>
        {result.fieldErrors && Object.keys(result.fieldErrors).length > 0 && (
          <ul className="list-inside list-disc text-xs">
            {Object.entries(result.fieldErrors).map(([field, errors]) =>
              errors.map((err, i) => (
                <li key={`${field}-${i}`}>
                  {field}: {err}
                </li>
              ))
            )}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
