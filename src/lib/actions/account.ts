"use server";

import type { z } from "zod";
import { withTransaction } from "@/lib/db";
import { createAction } from "@/lib/safe-action";
import { ValidationError } from "@/lib/errors";
import { deleteAccountSchema } from "@/lib/validation";
import { deleteOwnAccount } from "@/lib/services/account-deletion";
import { getFeedbackStore } from "@/lib/feedback";
import type { ActionResult } from "@/lib/action-result";

// Löscht den eigenen Account nach erneuter Passworteingabe. Nach Erfolg ist die Sitzung serverseitig
// ungültig (users-Zeile weg → refreshToken liefert null); die Oberfläche ruft anschließend
// signOut({ callbackUrl: "/auth/login" }) auf, damit auch das Cookie verschwindet. Fehlgründe (falsches
// Passwort, letzter Admin) kommen als ActionResult mit error zurück.
// Feedback-Dateien (Widget) liegen außerhalb der Datenbank und werden NACH der Transaktion gelöscht: Ein
// Datenbankfehler darf nie Feedback vernichten, während der Account bestehen bleibt. Scheitert das Löschen
// der Dateien, bleibt die Account-Löschung gültig; das Log nennt die user_id zum Nachräumen (grep im Volume).
export const deleteOwnAccountAction: (
  input: z.infer<typeof deleteAccountSchema>
) => Promise<ActionResult<void>> = createAction({
  schema: deleteAccountSchema,
  handler: async (input, userId) => {
    const result = await withTransaction((tx) => deleteOwnAccount(tx, userId, input.password));
    if (!result.ok) throw new ValidationError(result.reason);
    try {
      await getFeedbackStore().deleteForUser(userId);
    } catch (error) {
      console.error(`Feedback-Dateien von user_id ${userId} konnten nicht gelöscht werden:`, error);
    }
  },
});
