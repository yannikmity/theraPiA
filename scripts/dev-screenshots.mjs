// Startet Next gegen die Wegwerf-Datenbank aus .env.screenshots: standardmäßig den Dev-Server auf Port 3000,
// mit --prod den Produktionsserver (next start, vorher npm run build), mit --port (oder SHOTS_PORT) einen anderen Port.
// Aufruf: npm run shots:dev [-- --prod] [-- --port 3330]
// Eigenes Startskript statt `node --env-file=… next dev`, weil Next die Node-Flags des Elternprozesses in
// NODE_OPTIONS des Kindprozesses kopiert – dort ist --env-file verboten.
// Eine andere Wegwerf-Datenbank per Umgebung: DATABASE_URL=…/therapia_screenshots_<name> npm run shots:dev
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { assertThrowawayDatabase, nextServerCommand, shotsPort } from "./screenshots-lib.mjs";

const { values: args } = parseArgs({
  options: {
    prod: { type: "boolean", default: false },
    port: { type: "string" },
  },
});
// --port vor SHOTS_PORT vor 3000; shotsPort bricht bei ungültigem Wert mit deutscher Meldung ab.
const port = shotsPort(args.port);

const { args: nextArgs, env } = nextServerCommand({ prod: args.prod, port });
// Vorgaben vor .env.screenshots setzen: loadEnvFile und Next überschreiben vorhandene Variablen nicht – so gewinnt
// eine im Terminal gesetzte Variable, dann diese Vorgaben (NEXTAUTH_URL passend zum Port), dann die Datei.
for (const [key, value] of Object.entries(env)) process.env[key] ??= value;
process.loadEnvFile(".env.screenshots");
// Eine im Terminal exportierte DATABASE_URL hätte Vorrang – sie muss trotzdem eine Wegwerf-Datenbank sein.
assertThrowawayDatabase(process.env.DATABASE_URL ?? "");

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, ...nextArgs], { stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
