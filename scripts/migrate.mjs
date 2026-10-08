// Wendet ausstehende SQL-Migrationen aus migrations/ an.
// CLI: node scripts/migrate.mjs (liest DATABASE_URL)
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const LOCK_ID = 7274201;

// Datenbanken aus dem früheren Setup (docker-entrypoint-initdb.d) haben 001/002
// bereits, aber keine schema_migrations-Tabelle.
async function baseline(client) {
  const { rows } = await client.query("SELECT count(*)::int AS n FROM schema_migrations");
  if (rows[0].n > 0) return;
  const patients = await client.query("SELECT to_regclass('patients') IS NOT NULL AS present");
  if (!patients.rows[0].present) return;
  await client.query("INSERT INTO schema_migrations (name) VALUES ('001_initial_schema.sql')");
  const column = await client.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'patients' AND column_name = 'antragsdatum'`
  );
  if (column.rows.length > 0) {
    await client.query("INSERT INTO schema_migrations (name) VALUES ('002_group_therapy_categories.sql')");
  }
}

// options.lockId: Schlüssel der Advisory-Sperre. Standard ist die eine Sperre je Datenbank – zwei Container, die
// gleichzeitig starten, migrieren nacheinander. Tests migrieren je ein eigenes, privates Schema und nehmen eine eigene
// Sperre (src/lib/__tests__/helpers/test-db.ts), damit sie nicht aufeinander warten.
/** @param {{ lockId?: number }} [options] */
export async function runMigrations(client, dir, { lockId = LOCK_ID } = {}) {
  await client.query("SELECT pg_advisory_lock($1)", [lockId]);
  let failure;
  try {
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
    );
    await baseline(client);
    const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    const applied = [];
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(dir, file), "utf8");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`Migration ${file} fehlgeschlagen: ${err.message}`);
      }
      applied.push(file);
    }
    return applied;
  } catch (err) {
    failure = err;
    throw err;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock($1)", [lockId]);
    } catch (unlockError) {
      // Der Ursprungsfehler ist die Ursache und darf nicht verdeckt werden; die Sperre fällt mit der Verbindung.
      if (failure) console.error(`pg_advisory_unlock fehlgeschlagen: ${unlockError.message}`);
      else throw unlockError;
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  // RAISE NOTICE aus Migrationen (z. B. 010: entfernte doppelte Zuordnungen) im Log ausgeben.
  client.on("notice", (notice) => console.log(notice.message));
  try {
    const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations");
    const applied = await runMigrations(client, dir);
    console.log(applied.length ? `Migrationen angewendet: ${applied.join(", ")}` : "Datenbank ist aktuell.");
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
