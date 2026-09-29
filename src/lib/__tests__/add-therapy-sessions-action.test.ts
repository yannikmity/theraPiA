// @vitest-environment node
// Sammel-Speichern („Wie letzte Woche“): Die Action prüft Doppelte serverseitig in derselben Transaktion –
// auch innerhalb eines Stapels –, damit ein veralteter oder manipulierter Client nie Doppelte erzeugt.
import { describe, it, expect, afterEach, vi } from "vitest";
import pg, { type Client } from "pg";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture, countRows } from "./helpers/fixtures";

// `connections`: jeder withTransaction-Aufruf nimmt reihum die nächste Verbindung – so laufen parallele
// Aufrufe wie im Pool auf getrennten Verbindungen.
const state = vi.hoisted(() => ({
  client: undefined as Client | undefined,
  connections: [] as Client[],
  next: 0,
  userId: "",
}));

vi.mock("../auth", () => ({ auth: async () => ({ user: { id: state.userId, role: "pia" }, expires: "" }) }));
vi.mock("../db", () => ({
  query: (text: string, params?: unknown[]) => state.client!.query(text, params),
  // Wie withTransaction in db.ts, nur auf der Testverbindung.
  withTransaction: async <T,>(fn: (tx: Client) => Promise<T>): Promise<T> => {
    const client = state.connections[state.next++ % state.connections.length];
    await client.query("BEGIN");
    try {
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  },
}));

import { addTherapySessions } from "@/app/(app)/sessions/new/actions";

describe.skipIf(!TEST_DATABASE_URL)("addTherapySessions", () => {
  let cleanup: (() => Promise<void>) | undefined;
  let second: Client | undefined;
  afterEach(async () => {
    await second?.end();
    second = undefined;
    await cleanup?.();
    cleanup = undefined;
    state.client = undefined;
    state.connections = [];
    state.next = 0;
  });

  async function setup() {
    const t = await createTestDb();
    cleanup = t.cleanup;
    const f = await seedOwnershipFixture(t.client);
    state.client = t.client;
    state.connections = [t.client];
    state.userId = f.a.userId;
    return { db: t.client, f };
  }

  // Zweite echte Verbindung auf dasselbe Testschema, damit zwei Transaktionen wirklich parallel laufen.
  async function addSecondConnection(db: Client) {
    const { rows } = await db.query("SELECT current_schema() AS schema");
    second = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await second.connect();
    await second.query(`SET search_path TO ${rows[0].schema}`);
    state.connections.push(second);
  }

  const row = (patientId: string, date: string) => ({
    patientId,
    date,
    durationMinutes: 50,
    notes: "",
    category: "behandlung" as const,
  });

  it("speichert alle Zeilen und überspringt bestehende sowie im Stapel doppelte Sitzungen", async () => {
    const { db, f } = await setup();

    // 2026-01-02 existiert schon (Fixture), 2026-01-09 kommt zweimal im Stapel vor.
    const result = await addTherapySessions({
      sessions: [row(f.a.patientId, "2026-01-02"), row(f.a.patientId, "2026-01-09"), row(f.a.patientId, "2026-01-09")],
    });

    expect(result).toEqual({ success: true, data: { saved: 1, skipped: 2 } });
    expect(await countRows(db, "therapy_sessions", "WHERE patient_id = $1", [f.a.patientId])).toBe(2);
    expect(
      await countRows(db, "therapy_sessions", "WHERE patient_id = $1 AND date = '2026-01-09'", [f.a.patientId])
    ).toBe(1);
  });

  it("rollt den ganzen Stapel zurück, wenn eine Zeile eine fremde Patient:in nennt", async () => {
    const { db, f } = await setup();

    const result = await addTherapySessions({
      sessions: [row(f.a.patientId, "2026-01-09"), row(f.b.patientId, "2026-01-09")],
    });

    expect(result).toEqual({ success: false, error: "Patient:in nicht gefunden" });
    expect(await countRows(db, "therapy_sessions", "WHERE patient_id = $1", [f.a.patientId])).toBe(1);
    expect(await countRows(db, "therapy_sessions", "WHERE patient_id = $1", [f.b.patientId])).toBe(1);
  });

  it("erzeugt auch bei zwei gleichzeitigen Stapeln (Doppeltipp, zwei Tabs) keine Doppelten", async () => {
    const { db, f } = await setup();
    await addSecondConnection(db);

    const batch = { sessions: [row(f.a.patientId, "2026-01-09")] };
    const results = await Promise.all([addTherapySessions(batch), addTherapySessions(batch)]);

    const outcomes = results.map((r) => (r.success ? `${r.data.saved}/${r.data.skipped}` : r.error)).sort();
    expect(outcomes).toEqual(["0/1", "1/0"]);
    expect(
      await countRows(db, "therapy_sessions", "WHERE patient_id = $1 AND date = '2026-01-09'", [f.a.patientId])
    ).toBe(1);
  });
});
