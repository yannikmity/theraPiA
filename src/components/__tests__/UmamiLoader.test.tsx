// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  requestHeaders: new Headers(),
  config: {} as { UMAMI_SCRIPT_URL?: string; UMAMI_WEBSITE_ID?: string },
}));
vi.mock("next/headers", () => ({ headers: async () => state.requestHeaders }));
vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/config", () => ({ getConfig: () => state.config }));
vi.mock("@/components/analytics/UmamiScript", () => ({ UmamiScript: () => null }));

import { UmamiLoader } from "@/components/analytics/UmamiLoader";
import { UmamiScript } from "@/components/analytics/UmamiScript";

const CONFIG = {
  UMAMI_SCRIPT_URL: "https://analytics.example.org/script.js",
  UMAMI_WEBSITE_ID: "11111111-1111-4111-8111-111111111111",
};

beforeEach(() => {
  state.requestHeaders = new Headers();
  state.config = {};
});

describe("UmamiLoader", () => {
  it("reicht die Nonce aus dem Request-Header x-nonce an das Umami-Script", async () => {
    state.config = CONFIG;
    state.requestHeaders = new Headers({ "x-nonce": "AAAAAAAAAAAAAAAAAAAAAA==" });
    const element = await UmamiLoader();
    expect(element?.type).toBe(UmamiScript);
    expect(element?.props).toEqual({
      scriptUrl: CONFIG.UMAMI_SCRIPT_URL,
      websiteId: CONFIG.UMAMI_WEBSITE_ID,
      nonce: "AAAAAAAAAAAAAAAAAAAAAA==",
    });
  });

  it("rendert ohne Umami-Konfiguration nichts", async () => {
    state.requestHeaders = new Headers({ "x-nonce": "AAAAAAAAAAAAAAAAAAAAAA==" });
    expect(await UmamiLoader()).toBeNull();
  });
});
