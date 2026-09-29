"use server";

import { z } from "zod";
import { db, withTransaction } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { createAction } from "@/lib/safe-action";
import { ValidationError } from "@/lib/errors";
import { createInvitationSchema } from "@/lib/validation";
import { createInvitation, revokeInvitation } from "@/lib/services/invitations";
import { setUserDisabled, createPasswordResetToken } from "@/lib/services/accounts";
import { loadAdminOverview, type AdminOverview } from "@/lib/services/admin-overview";

// Typ-Export für AdminClient.tsx (wird beim Kompilieren entfernt – "use server"-Dateien dürfen zur
// Laufzeit nur async-Funktionen exportieren).
export type AdminData = AdminOverview;

export const createInvitationAction = createAction({
  schema: createInvitationSchema,
  role: "admin",
  handler: async (input, userId) => {
    const { token } = await createInvitation(db, {
      email: input.email,
      role: input.role,
      createdBy: userId,
      withDemoData: input.withDemoData,
    });
    return { link: `${getConfig().NEXTAUTH_URL}/auth/register?invite=${token}`, data: await loadAdminOverview(db) };
  },
});

export const revokeInvitationAction = createAction({
  schema: z.object({ id: z.string().uuid() }),
  role: "admin",
  handler: async (input) => {
    await revokeInvitation(db, input.id);
    return loadAdminOverview(db);
  },
});

export const createResetLinkAction = createAction({
  schema: z.object({ userId: z.string().uuid() }),
  role: "admin",
  handler: async (input) => {
    const token = await createPasswordResetToken(db, input.userId);
    return { link: `${getConfig().NEXTAUTH_URL}/auth/reset?token=${token}` };
  },
});

export const setUserDisabledAction = createAction({
  schema: z.object({ userId: z.string().uuid(), disabled: z.boolean() }),
  role: "admin",
  handler: async (input, userId) => {
    if (input.userId === userId) throw new ValidationError("Den eigenen Account kannst du nicht sperren");
    const result = await withTransaction((tx) => setUserDisabled(tx, input.userId, input.disabled));
    if (!result.ok) throw new ValidationError(result.reason);
    return loadAdminOverview(db);
  },
});
