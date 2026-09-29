import pg from "pg";
import { staleTestSchemas } from "./stale-schemas";

// Vitest-globalSetup (nur Projekt „standard“): läuft einmal pro Testlauf im Hauptprozess, bevor Worker starten.
// Jeder DB-Test legt ein Schema test_<ms>_<zufall> an und löscht es in seinem cleanup – nach einem Abbruch
// (Strg+C, Absturz) bleibt es liegen. Hier werden Schemas entfernt, die älter als eine Stunde sind.
export async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ nspname: string }>(
      "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'test%'"
    );
    for (const schema of staleTestSchemas(rows.map((r) => r.nspname), Date.now())) {
      // Name entspricht dem festen Muster aus staleTestSchemas, keine Nutzereingabe.
      await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      console.log(`Liegengebliebenes Test-Schema entfernt: ${schema}`);
    }
  } finally {
    await client.end();
  }
}
