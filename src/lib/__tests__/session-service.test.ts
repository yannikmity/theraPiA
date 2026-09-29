// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import bcrypt from "bcryptjs";
import type pg from "pg";
import type { Db } from "../db";
import { verifyCredentials, refreshToken, refreshTokenSafely, verifyPassword } from "../services/session";
import { createTestDb, TEST_DATABASE_URL } from "./helpers/test-db";

const PASSWORD = "richtig-langes-passwort";

describe.skipIf(!TEST_DATABASE_URL)("Sitzungslogik", () => {
  let client: pg.Client;
  let cleanup: () => Promise<void>;
  let userId: string;

  beforeEach(async () => {
    const t = await createTestDb();
    client = t.client;
    cleanup = t.cleanup;
    // Kosten 4 statt 12: nur für die Testgeschwindigkeit, bcrypt.compare liest die Kosten aus dem Hash.
    const hash = await bcrypt.hash(PASSWORD, 4);
    const { rows } = await client.query(
      "INSERT INTO users (email, password_hash, name, role, session_version) VALUES ('pia@example.com', $1, 'Test', 'pia', 3) RETURNING id",
      [hash]
    );
    userId = rows[0].id;
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("verifyCredentials", () => {
    it("liefert den Account bei richtigen Zugangsdaten", async () => {
      expect(await verifyCredentials(client, "pia@example.com", PASSWORD)).toEqual({
        id: userId,
        email: "pia@example.com",
        name: "Test",
        role: "pia",
        sessionVersion: 3,
        demo: false,
      });
    });

    it("normalisiert die eingegebene E-Mail-Adresse", async () => {
      const user = await verifyCredentials(client, "  PIA@Example.COM ", PASSWORD);
      expect(user?.id).toBe(userId);
    });

    it("lehnt ein falsches Passwort ab", async () => {
      expect(await verifyCredentials(client, "pia@example.com", "falsches-passwort")).toBeNull();
    });

    it("lehnt eine unbekannte E-Mail-Adresse ab", async () => {
      expect(await verifyCredentials(client, "niemand@example.com", PASSWORD)).toBeNull();
    });

    it("lehnt einen gesperrten Account ab", async () => {
      await client.query("UPDATE users SET disabled_at = now() WHERE id = $1", [userId]);
      expect(await verifyCredentials(client, "pia@example.com", PASSWORD)).toBeNull();
    });

    it("meldet einen Demo-Account mit demo: true", async () => {
      await client.query("UPDATE users SET is_demo = true WHERE id = $1", [userId]);
      expect(await verifyCredentials(client, "pia@example.com", PASSWORD)).toMatchObject({ id: userId, demo: true });
    });
  });

  describe("refreshToken", () => {
    it("übernimmt die aktuelle Rolle aus der Datenbank", async () => {
      await client.query("UPDATE users SET role = 'admin' WHERE id = $1", [userId]);
      const token = await refreshToken(client, { id: userId, role: "pia", sv: 3 });
      expect(token).toEqual({ id: userId, role: "admin", sv: 3, demo: false });
    });

    it("verwirft das Token, wenn die Session-Version nicht mehr passt", async () => {
      await client.query("UPDATE users SET session_version = session_version + 1 WHERE id = $1", [userId]);
      expect(await refreshToken(client, { id: userId, role: "pia", sv: 3 })).toBeNull();
    });

    it("verwirft das Token eines gesperrten Accounts", async () => {
      await client.query("UPDATE users SET disabled_at = now() WHERE id = $1", [userId]);
      expect(await refreshToken(client, { id: userId, role: "pia", sv: 3 })).toBeNull();
    });

    it("verwirft das Token eines gelöschten Accounts", async () => {
      await client.query("DELETE FROM users WHERE id = $1", [userId]);
      expect(await refreshToken(client, { id: userId, role: "pia", sv: 3 })).toBeNull();
    });

    it("liest das Demo-Kennzeichen bei jeder Prüfung frisch aus der Datenbank", async () => {
      await client.query("UPDATE users SET is_demo = true WHERE id = $1", [userId]);
      expect(await refreshToken(client, { id: userId, role: "pia", sv: 3 })).toEqual({ id: userId, role: "pia", sv: 3, demo: true });
    });
  });

  describe("verifyPassword", () => {
    it("bestätigt das richtige und lehnt ein falsches Passwort ab", async () => {
      expect(await verifyPassword(client, userId, PASSWORD)).toBe(true);
      expect(await verifyPassword(client, userId, "falsches-passwort")).toBe(false);
    });

    it("lehnt für einen unbekannten Account ab", async () => {
      expect(await verifyPassword(client, "00000000-0000-0000-0000-000000000000", PASSWORD)).toBe(false);
    });
  });
});

describe("refreshTokenSafely", () => {
  it("verwirft das Token bei einem Datenbankfehler statt zu werfen (fail-closed)", async () => {
    const db = {
      query: async () => {
        throw new Error("connection refused");
      },
    } as unknown as Db;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(refreshTokenSafely(db, { id: "u1", role: "pia", sv: 0 })).resolves.toBeNull();
      expect(error).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
    }
  });

  it("reicht ein gültiges Token mit frischer Rolle durch", async () => {
    const db = {
      query: async () => ({ rows: [{ role: "admin", session_version: 0, disabled_at: null, is_demo: false }] }),
    } as unknown as Db;
    expect(await refreshTokenSafely(db, { id: "u1", role: "pia", sv: 0 })).toEqual({ id: "u1", role: "admin", sv: 0, demo: false });
  });
});
