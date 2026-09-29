import { describe, it, expect } from "vitest";
import { staleTestSchemas, STALE_SCHEMA_AFTER_MS } from "./helpers/stale-schemas";

describe("staleTestSchemas", () => {
  const now = 1_790_000_000_000; // fester Zeitpunkt (13 Stellen wie Date.now())

  it("nennt nur Test-Schemas, deren Zeitstempel älter als die Frist ist", () => {
    const old = now - STALE_SCHEMA_AFTER_MS - 1;
    const fresh = now - 10 * 60_000;
    expect(
      staleTestSchemas(
        [`test_${old}_1`, `test_${old}_999999`, `test_${fresh}_2`, `test_${now}_3`, "public", "test_x_1", `test_${old}_abc`],
        now
      )
    ).toEqual([`test_${old}_1`, `test_${old}_999999`]);
  });

  it("liefert bei genau einer Stunde noch nichts (Grenze exklusiv)", () => {
    expect(staleTestSchemas([`test_${now - STALE_SCHEMA_AFTER_MS}_1`], now)).toEqual([]);
  });
});
