import { Pool, QueryResult } from "pg";
import "./pg-types";

export interface Db {
  query(text: string, params?: unknown[]): Promise<QueryResult>;
}

let pool: Pool | undefined;

function getPool(): Pool {
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export const db: Db = {
  query: (text, params) => getPool().query(text, params as unknown[]),
};

export async function query(
  text: string,
  params?: (string | number | boolean | null | string[])[]
): Promise<QueryResult> {
  return getPool().query(text, params);
}

export async function withTransaction<T>(fn: (tx: Db) => Promise<T>, begin = "BEGIN"): Promise<T> {
  const client = await getPool().connect();
  let releaseError: Error | undefined;
  try {
    await client.query(begin);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch (rollbackError) {
      // Ursprünglichen Fehler behalten; die kaputte Verbindung nicht zurück in den Pool geben.
      releaseError = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
    }
    throw error;
  } finally {
    client.release(releaseError);
  }
}

// Mehrere Leseabfragen mit einem gemeinsamen Stand (#41): eine Verbindung, ein Snapshot für die ganze Transaktion.
// READ COMMITTED reicht nicht – dort sieht jede Abfrage, was andere inzwischen committet haben.
export const SNAPSHOT_BEGIN = "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY";

export function withSnapshot<T>(fn: (tx: Db) => Promise<T>): Promise<T> {
  return withTransaction(fn, SNAPSHOT_BEGIN);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
