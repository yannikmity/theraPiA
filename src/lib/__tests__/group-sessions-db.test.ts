// @vitest-environment node
import { describe, it, expect, afterEach, vi } from "vitest";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";

vi.mock("../auth", () => ({ auth: vi.fn() }));
import { deleteGroupSession } from "../db/group-sessions";

describe.skipIf(!TEST_DATABASE_URL)("Doppelstunden löschen", () => {
  let cleanup: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    // Gruppen-Supervision von A, verknüpft mit A's Doppelstunde
    const groupSupervision = (
      await t.client.query(
        `INSERT INTO supervision_sessions (user_id, supervisor_id, date, duration_minutes, kind)
         VALUES ($1, $2, '2026-01-05', 60, 'group') RETURNING id`,
        [f.a.userId, f.a.supervisorId]
      )
    ).rows[0];
    await t.client.query(
      "INSERT INTO supervision_group_session_links (supervision_id, group_session_id) VALUES ($1, $2)",
      [groupSupervision.id, f.a.groupSessionId]
    );
    return { db: t.client, f, groupSupervisionId: groupSupervision.id as string };
  }

  it("löscht die eigene Doppelstunde samt Verknüpfung, die Gruppen-Supervision bleibt", async () => {
    const { db, f, groupSupervisionId } = await setup();

    await deleteGroupSession(db, f.a.userId, f.a.groupSessionId);

    expect(await countRows(db, "group_sessions", "WHERE id = $1", [f.a.groupSessionId])).toBe(0);
    expect(await countRows(db, "supervision_group_session_links", "WHERE group_session_id = $1", [f.a.groupSessionId])).toBe(0);
    expect(await countRows(db, "supervision_sessions", "WHERE id = $1", [groupSupervisionId])).toBe(1);
  });

  it("weist fremde Doppelstunden zurück", async () => {
    const { db, f } = await setup();

    await expect(deleteGroupSession(db, f.a.userId, f.b.groupSessionId)).rejects.toThrow("Doppelstunde nicht gefunden");

    expect(await countRows(db, "group_sessions", "WHERE id = $1", [f.b.groupSessionId])).toBe(1);
  });
});
