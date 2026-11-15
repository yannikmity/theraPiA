// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";

vi.mock("../auth", () => ({ auth: vi.fn() }));
import { mergeSupervisors } from "../db/supervisors";
import { NotFoundError } from "../errors";

describe.skipIf(!TEST_DATABASE_URL)("Supervisor:innen zusammenführen", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    const { rows } = await t.client.query("INSERT INTO supervisors (user_id, name) VALUES ($1, 'Doppelt') RETURNING id", [f.a.userId]);
    return { db: t.client, f, doppeltId: rows[0].id as string };
  }

  it("hängt alle Supervisionen um und löscht den aufgelösten Eintrag – keine Supervision geht verloren", async () => {
    const { db, f, doppeltId } = await setup();
    const vorher = await countRows(db, "supervision_sessions", "WHERE user_id = $1", [f.a.userId]);

    const moved = await mergeSupervisors(db, f.a.userId, f.a.supervisorId, doppeltId);

    expect(moved).toBe(vorher);
    expect(await countRows(db, "supervisors", "WHERE id = $1", [f.a.supervisorId])).toBe(0);
    expect(await countRows(db, "supervision_sessions", "WHERE user_id = $1", [f.a.userId])).toBe(vorher);
    expect(await countRows(db, "supervision_sessions", "WHERE supervisor_id = $1", [doppeltId])).toBe(vorher);
  });

  it("lehnt fremde Supervisor:innen ab und ändert nichts", async () => {
    const { db, f, doppeltId } = await setup();
    await expect(mergeSupervisors(db, f.a.userId, f.b.supervisorId, doppeltId)).rejects.toBeInstanceOf(NotFoundError);
    await expect(mergeSupervisors(db, f.a.userId, doppeltId, f.b.supervisorId)).rejects.toBeInstanceOf(NotFoundError);
    expect(await countRows(db, "supervisors", "WHERE id = $1", [f.b.supervisorId])).toBe(1);
    expect(await countRows(db, "supervision_sessions", "WHERE supervisor_id = $1", [f.b.supervisorId])).toBeGreaterThan(0);
  });
});
