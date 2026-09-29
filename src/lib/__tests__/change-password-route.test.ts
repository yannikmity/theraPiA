// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import type { Client } from "pg";
import bcrypt from "bcryptjs";
import { NextRequest } from "next/server";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";
import { seedOwnershipFixture } from "./helpers/fixtures";
import type { RateLimiter } from "../rate-limit";

const state = vi.hoisted(() => ({
  client: undefined as Client | undefined,
  session: null as null | { user: { id: string; role: string } },
  limiter: undefined as RateLimiter | undefined,
}));

vi.mock("@/lib/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/db", () => {
  const query = (text: string, params?: unknown[]) => state.client!.query(text, params);
  return { query, db: { query } };
});
vi.mock("@/lib/rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/rate-limit")>();
  // Stabiles Objekt, das je Test an einen frischen Limiter delegiert.
  const stub: RateLimiter = {
    check: (key) => state.limiter!.check(key),
    reset: (key) => state.limiter!.reset(key),
    size: () => state.limiter!.size(),
  };
  return { ...actual, passwordCheckLimiter: stub };
});

import { createRateLimiter } from "../rate-limit";
import { PASSWORD_CHECK_LIMIT } from "../constants";
import { PASSWORD_CHECK_LIMITED_MESSAGE } from "../services/password-check";
import { POST } from "@/app/api/auth/change-password/route";

const PASSWORD = "sicheres-passwort";
const NEW_PASSWORD = "neues-passwort-123";

function post(body: unknown, raw = false): NextRequest {
  return new NextRequest("http://localhost:3200/api/auth/change-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

describe.skipIf(!TEST_DATABASE_URL)("POST /api/auth/change-password", () => {
  let cleanup: (() => Promise<void>) | undefined;
  let userId = "";
  beforeEach(async () => {
    const t = await createTestDb();
    cleanup = t.cleanup;
    state.client = t.client;
    // Gleiche Grenze wie der echte Limiter (5 Versuche), aber je Test frisch.
    state.limiter = createRateLimiter({ limit: PASSWORD_CHECK_LIMIT, windowMs: 60_000 });
    const f = await seedOwnershipFixture(t.client);
    userId = f.a.userId;
    // Kosten 4 statt 12: nur für die Testgeschwindigkeit.
    await t.client.query("UPDATE users SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(PASSWORD, 4), userId]);
    state.session = { user: { id: userId, role: "pia" } };
  });
  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
    state.client = undefined;
  });

  async function storedRow() {
    return (await state.client!.query("SELECT password_hash, session_version FROM users WHERE id = $1", [userId])).rows[0];
  }

  it("antwortet 401 ohne Sitzung", async () => {
    state.session = null;
    const res = await POST(post({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }));
    expect(res.status).toBe(401);
  });

  it("antwortet 400 bei kaputtem JSON, Array und zu kurzem neuen Passwort", async () => {
    expect((await POST(post("{", true))).status).toBe(400);
    expect((await POST(post("[]", true))).status).toBe(400);
    const short = await POST(post({ currentPassword: PASSWORD, newPassword: "kurz" }));
    expect(short.status).toBe(400);
    expect(await short.json()).toEqual({ error: "Neues Passwort muss mindestens 10 Zeichen lang sein" });
  });

  it("antwortet 400 bei falschem aktuellen Passwort und ändert nichts", async () => {
    const res = await POST(post({ currentPassword: "falsch", newPassword: NEW_PASSWORD }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Aktuelles Passwort ist falsch" });
    const row = await storedRow();
    expect(await bcrypt.compare(PASSWORD, row.password_hash)).toBe(true);
    expect(row.session_version).toBe(0);
  });

  it("antwortet 429 nach 5 Fehlversuchen – auch mit richtigem Passwort – und ändert nichts", async () => {
    for (let i = 0; i < PASSWORD_CHECK_LIMIT; i++) {
      expect((await POST(post({ currentPassword: "falsch", newPassword: NEW_PASSWORD }))).status).toBe(400);
    }
    const res = await POST(post({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: PASSWORD_CHECK_LIMITED_MESSAGE });
    const row = await storedRow();
    expect(await bcrypt.compare(PASSWORD, row.password_hash)).toBe(true);
    expect(row.session_version).toBe(0);
  });

  it("ändert das Passwort, erhöht die Session-Version und setzt den Zähler zurück", async () => {
    for (let i = 0; i < PASSWORD_CHECK_LIMIT - 1; i++) {
      await POST(post({ currentPassword: "falsch", newPassword: NEW_PASSWORD }));
    }
    const res = await POST(post({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ message: "Passwort erfolgreich geändert" });
    const row = await storedRow();
    expect(await bcrypt.compare(NEW_PASSWORD, row.password_hash)).toBe(true);
    expect(row.session_version).toBe(1);
    expect(state.limiter!.size()).toBe(0);
    // Nach dem Reset stehen wieder volle 5 Versuche zur Verfügung: ein neuer Fehlversuch ist 400, nicht 429.
    expect((await POST(post({ currentPassword: "falsch", newPassword: NEW_PASSWORD }))).status).toBe(400);
  });
});
