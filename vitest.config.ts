import { configDefaults, defineConfig } from "vitest/config";
import path from "path";

// Lokale .env (falls vorhanden) für TEST_DATABASE_URL laden; in CI kommen die Werte aus der Umgebung.
try {
  process.loadEnvFile(".env");
} catch {
  // keine .env – ok
}

const ALL_TESTS = "src/**/__tests__/**/*.test.{ts,tsx}";
// Tests, die eine Zeitzone westlich von UTC voraussetzen (new Date("YYYY-MM-DD") fällt dort auf den Vortag).
// Sie laufen als eigenes Projekt mit festem TZ – unabhängig von Worker-Isolation oder Dateireihenfolge.
const WEST_OF_UTC_TESTS = "src/lib/__tests__/*-timezone.test.ts";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    // jsdom-Grundausstattung (ResizeObserver, Filter für das @page-Parse-Rauschen); in node-Umgebungen wirkungslos.
    setupFiles: ["src/lib/__tests__/helpers/setup-dom.ts"],
    // next-auth importiert "next/server" ohne Dateiendung – das löst nur Vites Resolver auf, nicht Nodes ESM
    // (nötig für den Proxy-Test).
    server: { deps: { inline: ["next-auth"] } },
    projects: [
      {
        extends: true,
        test: {
          name: "standard",
          include: [ALL_TESTS],
          exclude: [...configDefaults.exclude, WEST_OF_UTC_TESTS],
          // globalSetup ist eine Projekt-Option: nur hier, sonst liefe es je Projekt.
          globalSetup: ["src/lib/__tests__/helpers/global-setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "westlich-von-utc",
          include: [WEST_OF_UTC_TESTS],
          environment: "node",
          env: { TZ: "America/New_York" },
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
