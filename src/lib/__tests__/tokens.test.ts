// @vitest-environment node
import { describe, it, expect } from "vitest";
import { generateToken, hashToken } from "../tokens";

describe("tokens", () => {
  it("erzeugt URL-sichere, zufällige Tokens mit passendem SHA-256-Hash", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(a.token)).toBe(a.hash);
  });
});
