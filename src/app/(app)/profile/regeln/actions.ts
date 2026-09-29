"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { createAction } from "@/lib/safe-action";
import { abweichungenSchema } from "@/lib/ausbildungsregeln/validation";
import { loadRegelwerk, resetAbweichungen, saveAbweichungen } from "@/lib/services/ausbildungsregeln";

// Persönliche Ausbildungsregeln (#8): immer der angemeldete Account – die User-ID kommt aus der Sitzung (createAction),
// nie aus der Eingabe; eine mitgeschickte verwirft das Schema.
export const saveAbweichungenAction = createAction({
  schema: abweichungenSchema,
  handler: async (input, userId) => {
    await saveAbweichungen(db, userId, input);
    return loadRegelwerk(db, userId);
  },
});

export const resetAbweichungenAction = createAction({
  schema: z.object({}),
  handler: async (_input, userId) => {
    await resetAbweichungen(db, userId);
    return loadRegelwerk(db, userId);
  },
});
