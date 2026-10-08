"use server";

import {
  getFinancialSettings,
  updateFinancialSettings as updateFinancialSettingsDB,
  getSupervisors,
  getTherapySessions,
  getSupervisionSessions,
  getGroupSessions,
} from "@/lib/db/index";
import { calculateQuarterlyFinancesWithGroups, financeTotals } from "@/lib/calculations";
import { getCurrentRegelwerk } from "@/lib/db/regelwerk";
import { withTransaction } from "@/lib/db";
import { FinancialSettings, Supervisor } from "@/types";
import { createAction } from "@/lib/safe-action";
import { updateFinancialSettingsSchema } from "@/lib/validation";
import { ActionResult } from "@/lib/action-result";
import { z } from "zod";

interface FinancesData {
  settings: FinancialSettings;
  supervisors: Supervisor[];
  quarters: { quarter: string; income: number; costs: number; profit: number }[];
  totalIncome: number;
  totalCosts: number;
  expenseYears: number[]; // Jahre mit Supervisionen, absteigend – Auswahl für den Ausgaben-Export
}

export async function loadFinancesData(): Promise<FinancesData> {
  const [settings, supervisors, therapySessions, supervisionSessions, groupSessions, regelwerk] = await Promise.all([
    getFinancialSettings(),
    getSupervisors(),
    getTherapySessions(),
    getSupervisionSessions(),
    getGroupSessions(),
    getCurrentRegelwerk(),
  ]);

  const quarters = calculateQuarterlyFinancesWithGroups(
    therapySessions,
    supervisionSessions,
    groupSessions,
    settings.incomePerHour,
    settings.supervisionCosts,
    regelwerk.ebmStaffeln
  );
  const { totalIncome, totalCosts } = financeTotals(
    therapySessions,
    supervisionSessions,
    groupSessions,
    settings.incomePerHour,
    settings.supervisionCosts,
    regelwerk.ebmStaffeln
  );

  const expenseYears = [...new Set(supervisionSessions.map((s) => Number(s.date.slice(0, 4))))].sort((a, b) => b - a);

  return { settings, supervisors, quarters, totalIncome, totalCosts, expenseYears };
}

export const saveFinancialSettings: (
  input: z.infer<typeof updateFinancialSettingsSchema>
) => Promise<ActionResult<FinancesData>> = createAction({
  schema: updateFinancialSettingsSchema,
  handler: async (input, userId) => {
    await withTransaction((tx) => updateFinancialSettingsDB(tx, userId, input));
    return loadFinancesData();
  },
});
