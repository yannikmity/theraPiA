import { unstable_rethrow } from "next/navigation";
import { fail, UNEXPECTED_ERROR_MESSAGE, type ActionResult } from "./action-result";

// Ein Server-Action-Aufruf wird abgelehnt, wenn das Netz weg oder der Server nicht erreichbar ist – dann käme kein
// ActionResult, sondern eine unbehandelte Ablehnung ohne Meldung (#28). Hier wird daraus dieselbe allgemeine Meldung,
// die createAction bei unerwarteten Fehlern liefert; Aufrufer prüfen nur noch result.success. Die Ursache landet in
// der Browser-Konsole (#57). Ausnahme: redirect()/notFound() einer Action kommen ebenfalls als Ablehnung an – die
// gehören Next (Navigation) und werden unverändert weitergeworfen (unstable_rethrow, next/navigation).
export async function runAction<T>(call: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await call();
  } catch (error) {
    unstable_rethrow(error);
    console.error("Server-Action fehlgeschlagen:", error);
    return fail(UNEXPECTED_ERROR_MESSAGE);
  }
}
