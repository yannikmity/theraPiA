// Beim Serverstart Konfiguration prüfen. Ist sie ungültig, beendet sich der Prozess mit Exit-Code 1:
// Ein Fehler in register() allein bricht den Next.js-Server nicht ab, der Container liefe sonst ohne
// funktionierende App weiter. So startet Docker ihn neu, und `docker compose logs app` zeigt die Ursache.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getConfig } = await import("./lib/config");
    try {
      getConfig();
    } catch (err) {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }
}
