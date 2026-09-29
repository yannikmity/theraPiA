"use server";

import { db, withTransaction } from "@/lib/db";
import { createAction } from "@/lib/safe-action";
import { ebmStaffelLoeschenSchema, ebmStaffelSchema } from "@/lib/ausbildungsregeln/validation";
import { deleteEbmStaffel, loadEbmStaffelnFuerPflege, saveEbmStaffel } from "@/lib/services/ausbildungsregeln";

// EBM-Staffel (#8): nur Admins. Kopf und Stufen in einer Transaktion; Antwort ist immer die aktuelle Liste.
export const saveEbmStaffelAction = createAction({
  schema: ebmStaffelSchema,
  role: "admin",
  handler: async (input) => {
    await withTransaction((tx) => saveEbmStaffel(tx, input));
    return loadEbmStaffelnFuerPflege(db);
  },
});

export const deleteEbmStaffelAction = createAction({
  schema: ebmStaffelLoeschenSchema,
  role: "admin",
  handler: async (input) => {
    await withTransaction((tx) => deleteEbmStaffel(tx, input.id));
    return loadEbmStaffelnFuerPflege(db);
  },
});
