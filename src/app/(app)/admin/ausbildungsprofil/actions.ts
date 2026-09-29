"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { createAction } from "@/lib/safe-action";
import { instanzprofilSchema } from "@/lib/ausbildungsregeln/validation";
import { loadAusbildungsprofilDaten, resetInstanzprofil, saveInstanzprofil } from "@/lib/services/ausbildungsregeln";

// Ausbildungsprofil der Instanz (#8): nur Admins – createAction prüft die Rolle aus der Sitzung, bevor etwas passiert.
export const saveAusbildungsprofilAction = createAction({
  schema: instanzprofilSchema,
  role: "admin",
  handler: async (input) => {
    await saveInstanzprofil(db, input);
    return loadAusbildungsprofilDaten(db);
  },
});

export const resetAusbildungsprofilAction = createAction({
  schema: z.object({}),
  role: "admin",
  handler: async () => {
    await resetInstanzprofil(db);
    return loadAusbildungsprofilDaten(db);
  },
});
