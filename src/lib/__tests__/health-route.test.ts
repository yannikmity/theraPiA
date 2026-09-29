// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

const state = vi.hoisted(() => ({ down: false }));
vi.mock("@/lib/db", () => ({
  db: {
    query: async () => {
      if (state.down) throw new Error("ECONNREFUSED");
      return { rows: [{ "?column?": 1 }] };
    },
  },
}));

import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("antwortet 200 { status: ok }, wenn die Datenbank antwortet", async () => {
    state.down = false;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("antwortet 503 { status: error }, wenn die Datenbank nicht erreichbar ist – ohne Fehlertext", async () => {
    state.down = true;
    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ status: "error" });
  });
});
