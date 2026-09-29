// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { notFound, redirect } from "next/navigation";
import { runAction } from "../run-action";
import { ok, UNEXPECTED_ERROR_MESSAGE } from "../action-result";

describe("runAction", () => {
  it("reicht Erfolg und fachliche Fehler der Action unverändert durch", async () => {
    expect(await runAction(async () => ok(42))).toEqual({ success: true, data: 42 });
    expect(await runAction(async () => ({ success: false as const, error: "Nicht gefunden" }))).toEqual({ success: false, error: "Nicht gefunden" });
  });

  it("macht aus einem abgelehnten Aufruf (Netz weg) die allgemeine Meldung und protokolliert die Ursache", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new TypeError("Failed to fetch");
    const result = await runAction<void>(async () => {
      throw cause;
    });
    expect(result).toEqual({ success: false, error: UNEXPECTED_ERROR_MESSAGE, fieldErrors: undefined });
    expect(logged).toHaveBeenCalledWith("Server-Action fehlgeschlagen:", cause);
    logged.mockRestore();
  });

  // Next lehnt den Action-Aufruf bei redirect() mit einem NEXT_REDIRECT-Fehler ab, damit der Router navigiert (#57).
  it("reicht redirect() und notFound() einer Action an Next durch – keine Meldung, kein Protokoll", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(runAction<void>(async () => redirect("/auth/login"))).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_REDIRECT;/) });
    await expect(runAction<void>(async () => notFound())).rejects.toMatchObject({ digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/) });
    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
