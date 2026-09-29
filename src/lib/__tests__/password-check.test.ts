// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import bcrypt from "bcryptjs";
import type { Db } from "../db";
import { createRateLimiter } from "../rate-limit";
import { checkPasswordThrottled } from "../services/password-check";

const PASSWORD = "richtig-langes-passwort";
// Kosten 4 statt 12: nur für die Testgeschwindigkeit, bcrypt.compare liest die Kosten aus dem Hash.
const row = { password_hash: bcrypt.hashSync(PASSWORD, 4) };
const dbWith = (rows: unknown[]) => ({ query: vi.fn(async () => ({ rows })) }) as unknown as Db & { query: ReturnType<typeof vi.fn> };
const limiter = (limit: number) => createRateLimiter({ limit, windowMs: 1000, now: () => 0 });

describe("checkPasswordThrottled", () => {
  it("bestätigt das richtige Passwort und setzt den Zähler zurück", async () => {
    const l = limiter(2);
    const db = dbWith([row]);
    expect(await checkPasswordThrottled(db, l, "u1", "falsch")).toEqual({ ok: false, code: "wrong" });
    expect(await checkPasswordThrottled(db, l, "u1", PASSWORD)).toEqual({ ok: true });
    // ohne Reset wäre dies der dritte Versuch und geblockt
    expect(await checkPasswordThrottled(db, l, "u1", PASSWORD)).toEqual({ ok: true });
  });

  it("blockt nach dem Limit auch das richtige Passwort und fragt die Datenbank nicht mehr", async () => {
    const l = limiter(2);
    const db = dbWith([row]);
    await checkPasswordThrottled(db, l, "u1", "falsch");
    await checkPasswordThrottled(db, l, "u1", "falsch");
    db.query.mockClear();
    expect(await checkPasswordThrottled(db, l, "u1", PASSWORD)).toEqual({ ok: false, code: "limited" });
    expect(db.query).not.toHaveBeenCalled();
    // andere Person bleibt frei
    expect(await checkPasswordThrottled(db, l, "u2", PASSWORD)).toEqual({ ok: true });
  });

  it("meldet einen fehlenden Account wie ein falsches Passwort", async () => {
    expect(await checkPasswordThrottled(dbWith([]), limiter(5), "u1", PASSWORD)).toEqual({ ok: false, code: "wrong" });
  });
});
