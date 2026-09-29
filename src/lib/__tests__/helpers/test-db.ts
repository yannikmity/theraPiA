import pg from "pg";
import "../../pg-types";
import path from "node:path";
import { copyFile, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { runMigrations } from "../../../../scripts/migrate.mjs";

export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
export const MIGRATIONS_DIR = path.resolve(__dirname, "../../../../migrations");

export async function createTestDb(options: { migrate?: boolean } = {}) {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  const schema = `test_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);
  if (options.migrate !== false) {
    // Eigene Sperre je Test-Schema (#57): Mit der gemeinsamen Sperre des Runners warteten parallele Test-Dateien – und
    // Testläufe anderer Checkouts auf derselben Datenbank – aufeinander und liefen unter Last in den 5-s-Timeout.
    // Eine zufällige Kollision kostet nur Wartezeit, keinen Fehler.
    const lockId = 1 + Math.floor(Math.random() * 2_000_000_000);
    await runMigrations(client, MIGRATIONS_DIR, { lockId });
  }
  return {
    client,
    cleanup: async () => {
      await client.query(`DROP SCHEMA ${schema} CASCADE`);
      await client.end();
    },
  };
}

// Bringt eine leere Test-DB auf einen älteren Migrationsstand, um den Update-Pfad einer bestehenden Instanz zu prüfen:
// wendet nur die Dateien bis einschließlich `letzte` an (Name, z. B. "004_planned_sessions_per_week.sql").
export async function migrateBis(client: pg.Client, letzte: string): Promise<string[]> {
  const dir = await mkdtemp(path.join(tmpdir(), "therapia-migrate-bis-"));
  try {
    for (const file of (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql") && f <= letzte)) {
      await copyFile(path.join(MIGRATIONS_DIR, file), path.join(dir, file));
    }
    return await runMigrations(client, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
