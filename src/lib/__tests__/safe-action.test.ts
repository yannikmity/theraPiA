import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { notFound, redirect } from "next/navigation";

const { authMock } = vi.hoisted(() => ({ authMock: vi.fn() }));
vi.mock("../auth", () => ({ auth: authMock }));

import { createAction } from "../safe-action";
import { UNEXPECTED_ERROR_MESSAGE } from "../action-result";

const adminSession = { user: { id: "u-admin", role: "admin" }, expires: "" };
const piaSession = { user: { id: "u-pia", role: "pia" }, expires: "" };

describe("createAction", () => {
  beforeEach(() => authMock.mockReset());

  it("lehnt ohne Sitzung ab, ohne den Handler aufzurufen", async () => {
    authMock.mockResolvedValue(null);
    const handler = vi.fn();
    const action = createAction({ handler });
    expect(await action(undefined)).toEqual({ success: false, error: "Nicht angemeldet" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("prüft die Rolle in derselben Sitzungsabfrage – kein zweites auth()", async () => {
    authMock.mockResolvedValue(piaSession);
    const handler = vi.fn();
    const action = createAction({ role: "admin", handler });
    expect(await action(undefined)).toEqual({ success: false, error: "Keine Berechtigung" });
    expect(handler).not.toHaveBeenCalled();
    expect(authMock).toHaveBeenCalledTimes(1);
  });

  it("lehnt eine Sitzung ohne Rolle für Admin-Aktionen ab (fail-closed)", async () => {
    authMock.mockResolvedValue({ user: { id: "u-ohne-rolle" }, expires: "" });
    const handler = vi.fn();
    const action = createAction({ role: "admin", handler });
    expect(await action(undefined)).toEqual({ success: false, error: "Keine Berechtigung" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("übergibt validierte Eingabe und Nutzer-ID an den Handler", async () => {
    authMock.mockResolvedValue(adminSession);
    const handler = vi.fn(async (input: { n: number }, userId: string) => `${userId}:${input.n}`);
    const action = createAction({ schema: z.object({ n: z.number() }), role: "admin", handler });
    expect(await action({ n: 1 })).toEqual({ success: true, data: "u-admin:1" });
    expect(authMock).toHaveBeenCalledTimes(1);
  });

  it("meldet Validierungsfehler je Feld", async () => {
    authMock.mockResolvedValue(adminSession);
    const action = createAction({ schema: z.object({ n: z.number() }), handler: async () => "x" });
    const result = await action({ n: "nein" } as unknown as { n: number });
    expect(result.success).toBe(false);
    if (!result.success) expect(Object.keys(result.fieldErrors ?? {})).toEqual(["n"]);
  });

  // Next lehnt den Action-Aufruf bei redirect()/notFound() mit seinem Fehler ab, damit der Router navigiert (#57).
  it("reicht redirect() und notFound() aus dem Handler an Next durch – keine Meldung, kein Protokoll", async () => {
    authMock.mockResolvedValue(adminSession);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await expect(createAction({ handler: async () => redirect("/x") })(undefined)).rejects.toMatchObject({
        digest: expect.stringMatching(/^NEXT_REDIRECT;/),
      });
      await expect(createAction({ handler: async () => notFound() })(undefined)).rejects.toMatchObject({
        digest: expect.stringMatching(/^NEXT_HTTP_ERROR_FALLBACK;404/),
      });
      expect(logged).not.toHaveBeenCalled();
    } finally {
      logged.mockRestore();
    }
  });

  it("meldet einen unerwarteten Fehler weiter mit der allgemeinen Meldung und protokolliert ihn", async () => {
    authMock.mockResolvedValue(adminSession);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const boom = new Error("kaputt");
      const result = await createAction({ handler: async () => { throw boom; } })(undefined);
      expect(result).toEqual({ success: false, error: UNEXPECTED_ERROR_MESSAGE });
      expect(logged).toHaveBeenCalledWith("Unexpected action error:", boom);
    } finally {
      logged.mockRestore();
    }
  });
});
