// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import type { Client } from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { countRows, seedOwnershipFixture } from "./helpers/fixtures";

const state = vi.hoisted(() => ({ client: undefined as Client | undefined, userId: "" }));

vi.mock("../db", () => ({
  query: (text: string, params?: unknown[]) => state.client!.query(text, params),
}));
vi.mock("../db/get-current-user", () => ({ getCurrentUserId: async () => state.userId }));

import { getFinancialSettings, updateFinancialSettings } from "../db/financial-settings";

describe.skipIf(!TEST_DATABASE_URL)("Geplante Sitzungen pro Woche (financial_settings)", () => {
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
    return { db: t.client, f };
  }

  it("legt beim ersten Lesen Standardwerte an: Stundensatz 0, keine Planung", async () => {
    await setup();
    expect(await getFinancialSettings()).toEqual({ incomePerHour: 0, supervisionCosts: {}, plannedSessionsPerWeek: null });
  });

  it("zwei gleichzeitige erste Lesezugriffe gelingen beide und legen genau eine Zeile an", async () => {
    const { db, f } = await setup();
    const defaults = { incomePerHour: 0, supervisionCosts: {}, plannedSessionsPerWeek: null };
    const [first, second] = await Promise.all([getFinancialSettings(), getFinancialSettings()]);
    expect(first).toEqual(defaults);
    expect(second).toEqual(defaults);
    const rows = await db.query("SELECT income_per_hour, planned_sessions_per_week FROM financial_settings WHERE user_id = $1", [f.a.userId]);
    expect(rows.rows).toEqual([{ income_per_hour: 0, planned_sessions_per_week: null }]);
  });

  it("liefert die Supervisionskosten schon beim ersten Lesen, wenn die Einstellungszeile noch fehlt", async () => {
    const { db, f } = await setup();
    await db.query("UPDATE supervisors SET cost_per_hour = 90 WHERE id = $1", [f.a.supervisorId]);
    await db.query("UPDATE supervisors SET cost_per_hour = 75 WHERE id = $1", [f.b.supervisorId]);
    expect(await countRows(db, "financial_settings", "WHERE user_id = $1", [f.a.userId])).toBe(0);
    expect(await getFinancialSettings()).toEqual({
      incomePerHour: 0,
      supervisionCosts: { [f.a.supervisorId]: 90 },
      plannedSessionsPerWeek: null,
    });
    // Zweites Lesen (Zeile vorhanden): dasselbe Ergebnis, nichts von Account B.
    expect((await getFinancialSettings()).supervisionCosts).toEqual({ [f.a.supervisorId]: 90 });
  });

  it("speichert die Planung und liest sie zurück; leer setzt sie zurück", async () => {
    await setup();
    const base = await getFinancialSettings();
    await updateFinancialSettings({ ...base, incomePerHour: 85, plannedSessionsPerWeek: 6 });
    expect(await getFinancialSettings()).toEqual({ incomePerHour: 85, supervisionCosts: {}, plannedSessionsPerWeek: 6 });
    await updateFinancialSettings({ ...base, incomePerHour: 85, plannedSessionsPerWeek: null });
    expect((await getFinancialSettings()).plannedSessionsPerWeek).toBeNull();
  });

  it("ein Schreibpfad ohne plannedSessionsPerWeek lässt die Planung unverändert; null setzt sie zurück", async () => {
    await setup();
    await updateFinancialSettings({ incomePerHour: 85, supervisionCosts: {}, plannedSessionsPerWeek: 6 });
    await updateFinancialSettings({ incomePerHour: 90, supervisionCosts: {} });
    expect(await getFinancialSettings()).toEqual({ incomePerHour: 90, supervisionCosts: {}, plannedSessionsPerWeek: 6 });
    await updateFinancialSettings({ incomePerHour: 90, supervisionCosts: {}, plannedSessionsPerWeek: null });
    expect((await getFinancialSettings()).plannedSessionsPerWeek).toBeNull();
  });

  it("legt beim ersten Schreiben ohne Planung eine Zeile mit NULL an", async () => {
    const { db, f } = await setup();
    await updateFinancialSettings({ incomePerHour: 70, supervisionCosts: {} });
    const rows = await db.query("SELECT income_per_hour, planned_sessions_per_week FROM financial_settings WHERE user_id = $1", [f.a.userId]);
    expect(rows.rows).toEqual([{ income_per_hour: 70, planned_sessions_per_week: null }]);
  });

  it("die Datenbank lehnt mehr als 60 Sitzungen pro Woche ab", async () => {
    const { db, f } = await setup();
    await expect(
      db.query("INSERT INTO financial_settings (user_id, income_per_hour, planned_sessions_per_week) VALUES ($1, 0, 61)", [f.a.userId])
    ).rejects.toThrow(/check/i);
  });
});
