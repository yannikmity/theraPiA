// Schema-Namen aus createTestDb: test_<Unix-ms>_<Zufall>. Ein Schema gilt als liegengeblieben, wenn sein Zeitstempel
// älter als eine Stunde ist. Jüngere gehören einem laufenden Testlauf – auch einem parallelen aus einem zweiten
// Worktree gegen dieselbe Datenbank – und bleiben unangetastet.
export const STALE_SCHEMA_AFTER_MS = 60 * 60 * 1000;
const TEST_SCHEMA = /^test_(\d{13})_\d{1,6}$/;

export function staleTestSchemas(names: string[], now: number): string[] {
  return names.filter((name) => {
    const match = TEST_SCHEMA.exec(name);
    return match !== null && Number(match[1]) < now - STALE_SCHEMA_AFTER_MS;
  });
}
