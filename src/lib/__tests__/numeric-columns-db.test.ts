// @vitest-environment node
// NUMERIC/DECIMAL (OID 1700) lieferte pg als String. Die Werte liefen dann in Zod-Schemas mit
// z.number() und scheiterten mit „Ungültige Eingabe“ (Finanzen speichern, Supervisor:in umschalten).
import { describe, it, expect, afterEach, vi } from "vitest";
import type { Client } from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";
import { updateFinancialSettingsSchema, updateSupervisorSchema } from "../validation";

const state = vi.hoisted(() => ({ client: undefined as Client | undefined, userId: "" }));

vi.mock("../db", () => ({
  query: (text: string, params?: unknown[]) => state.client!.query(text, params),
}));
vi.mock("../db/get-current-user", () => ({ getCurrentUserId: async () => state.userId }));

import { getSupervisors, updateSupervisor } from "../db/supervisors";
import { getFinancialSettings, updateFinancialSettings } from "../db/financial-settings";
import { getGroups } from "../db/groups";

describe.skipIf(!TEST_DATABASE_URL)("NUMERIC-Spalten kommen als Zahl", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    state.client = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    state.client = t.client;
    state.userId = f.a.userId;
    await t.client.query("UPDATE supervisors SET cost_per_hour = 112.5 WHERE id = $1", [f.a.supervisorId]);
    await t.client.query("INSERT INTO financial_settings (user_id, income_per_hour) VALUES ($1, 80.25)", [
      f.a.userId,
    ]);
    await t.client.query("UPDATE groups SET avg_kids = 6.5 WHERE id = $1", [f.a.groupId]);
    return { db: t.client, f };
  }

  it("liest NULL weiterhin als null", async () => {
    const { db } = await setup();
    const { rows } = await db.query("SELECT NULL::numeric AS n, 1.5::numeric AS x");
    expect(rows[0].n).toBeNull();
    expect(rows[0].x).toBe(1.5);
  });

  it("getSupervisors liefert costPerHour als number", async () => {
    await setup();
    const [sv] = await getSupervisors();
    expect(typeof sv.costPerHour).toBe("number");
    expect(sv.costPerHour).toBe(112.5);
  });

  it("getFinancialSettings liefert incomePerHour und supervisionCosts als number", async () => {
    const { f } = await setup();
    const settings = await getFinancialSettings();
    expect(typeof settings.incomePerHour).toBe("number");
    expect(settings.incomePerHour).toBe(80.25);
    const cost = settings.supervisionCosts[f.a.supervisorId as keyof typeof settings.supervisionCosts];
    expect(typeof cost).toBe("number");
    expect(cost).toBe(112.5);
  });

  it("getGroups liefert avgKids als number", async () => {
    await setup();
    const [group] = await getGroups();
    expect(group.avgKids).toBe(6.5);
  });

  it("Supervisor:in mit Stundensatz umschalten besteht das Schema und wird gespeichert", async () => {
    const { db, f } = await setup();
    const [sv] = await getSupervisors();
    const parsed = updateSupervisorSchema.safeParse({
      id: sv.id,
      name: sv.name,
      costPerHour: sv.costPerHour,
      isActive: !sv.isActive,
    });
    expect(parsed.success).toBe(true);
    await updateSupervisor({ ...sv, isActive: !sv.isActive });

    const { rows } = await db.query("SELECT cost_per_hour, is_active FROM supervisors WHERE id = $1", [
      f.a.supervisorId,
    ]);
    expect(rows[0]).toEqual({ cost_per_hour: 112.5, is_active: !sv.isActive });
  });

  it("Finanzen speichern: gelesene Einstellungen bestehen das Schema und kommen unverändert zurück", async () => {
    await setup();
    const before = await getFinancialSettings();
    const parsed = updateFinancialSettingsSchema.safeParse(before);
    expect(parsed.success).toBe(true);

    await updateFinancialSettings(state.client!, state.userId, { ...before, incomePerHour: 95.75 });
    const after = await getFinancialSettings();
    expect(after).toEqual({ ...before, incomePerHour: 95.75 });
  });
});
