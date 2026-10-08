// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { Pool, type PoolClient } from "pg";
import { withTransaction, withSnapshot, closePool } from "../db";

// Fake-Verbindung: `fails` nennt SQL-Befehle, die scheitern sollen. Der Pool wird nie wirklich verbunden.
const client = {
  fails: new Set<string>(),
  calls: [] as string[],
  query: vi.fn(async (sql: string) => {
    client.calls.push(sql);
    if (client.fails.has(sql)) throw new Error(`${sql} fehlgeschlagen`);
    return { rows: [] };
  }),
  release: vi.fn(),
};

beforeEach(() => {
  client.fails.clear();
  client.calls.length = 0;
  client.query.mockClear();
  client.release.mockClear();
  // `as never`: connect hat Überladungen (Promise und Callback), der Spy-Typ würde sonst an der Signatur scheitern.
  vi.spyOn(Pool.prototype, "connect").mockImplementation((() => Promise.resolve(client as unknown as PoolClient)) as never);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await closePool();
});

describe("withTransaction", () => {
  it("umschließt die Arbeit mit BEGIN und COMMIT und gibt die Verbindung frei", async () => {
    const result = await withTransaction(async (tx) => {
      await tx.query("SELECT 1");
      return 42;
    });
    expect(result).toBe(42);
    expect(client.calls).toEqual(["BEGIN", "SELECT 1", "COMMIT"]);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it("rollt bei einem Fehler zurück, wirft den Ursprungsfehler und gibt die Verbindung frei", async () => {
    await expect(
      withTransaction(async () => {
        throw new Error("fachlicher Fehler");
      })
    ).rejects.toThrow("fachlicher Fehler");
    expect(client.calls).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it("behält den Ursprungsfehler, wenn auch ROLLBACK scheitert, und verwirft die Verbindung", async () => {
    client.fails.add("ROLLBACK");
    await expect(
      withTransaction(async () => {
        throw new Error("fachlicher Fehler");
      })
    ).rejects.toThrow("fachlicher Fehler");
    expect(client.release).toHaveBeenCalledTimes(1);
    const [releaseError] = client.release.mock.calls[0] as [Error];
    expect(releaseError).toBeInstanceOf(Error);
    expect(releaseError.message).toBe("ROLLBACK fehlgeschlagen");
  });

  it("rollt zurück und wirft, wenn COMMIT scheitert", async () => {
    client.fails.add("COMMIT");
    await expect(withTransaction(async () => "x")).rejects.toThrow("COMMIT fehlgeschlagen");
    expect(client.calls).toEqual(["BEGIN", "COMMIT", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });

  it("withSnapshot liest mit REPEATABLE READ READ ONLY (#41)", async () => {
    await withSnapshot((tx) => tx.query("SELECT 1"));
    expect(client.calls).toEqual(["BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY", "SELECT 1", "COMMIT"]);
    expect(client.release).toHaveBeenCalledWith(undefined);
  });
});
