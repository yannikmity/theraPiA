// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const state = vi.hoisted(() => ({
  mailEnabled: true,
  allow: true,
  result: null as { email: string; token: string } | null,
  afterTasks: [] as Array<() => unknown>,
  sendMail: vi.fn<(mail: { to: string; subject: string; text: string }) => Promise<void>>(async () => undefined),
  requestPasswordReset: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  // after() läuft im Test nicht nach einer echten Antwort: Aufgaben sammeln und gezielt ausführen.
  after: (task: () => unknown) => {
    state.afterTasks.push(task);
  },
}));
vi.mock("@/lib/mail", () => ({ isMailEnabled: () => state.mailEnabled, sendMail: state.sendMail }));
vi.mock("@/lib/db", () => ({ withTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) => fn({}) }));
vi.mock("@/lib/services/accounts", () => ({ requestPasswordReset: state.requestPasswordReset }));
vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config")>()),
  getConfig: () => ({ NEXTAUTH_URL: "https://therapia.beispiel-institut.de" }),
}));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  forgotThrottle: { allow: () => state.allow, reset: () => undefined },
}));

import { POST } from "@/app/api/auth/forgot/route";
import { FORGOT_RESPONSE_MESSAGE } from "@/lib/password-reset-mail";

function post(body: unknown, raw = false): NextRequest {
  return new NextRequest("http://localhost:3200/api/auth/forgot", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.5" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

async function runAfterTasks() {
  for (const task of state.afterTasks.splice(0)) await task();
}

describe("POST /api/auth/forgot", () => {
  beforeEach(() => {
    state.mailEnabled = true;
    state.allow = true;
    state.afterTasks = [];
    state.sendMail.mockReset();
    state.requestPasswordReset.mockReset();
    state.requestPasswordReset.mockImplementation(async () => state.result);
    state.result = null;
  });

  it("antwortet 404 ohne Mailversand und plant nichts", async () => {
    state.mailEnabled = false;
    const res = await POST(post({ email: "pia@example.com" }));
    expect(res.status).toBe(404);
    expect(state.afterTasks).toHaveLength(0);
  });

  it("antwortet 429, wenn das Limit erreicht ist, ohne etwas zu planen", async () => {
    state.allow = false;
    const res = await POST(post({ email: "pia@example.com" }));
    expect(res.status).toBe(429);
    expect(state.afterTasks).toHaveLength(0);
  });

  it("antwortet 400 bei ungültiger Eingabe", async () => {
    expect((await POST(post("{kaputt", true))).status).toBe(400);
    expect((await POST(post([]))).status).toBe(400);
    expect((await POST(post({ email: "keine-adresse" }))).status).toBe(400);
    expect(state.afterTasks).toHaveLength(0);
  });

  it("antwortet für bekannte und unbekannte Adressen gleich, bevor die Datenbank gefragt wird", async () => {
    const unknown = await POST(post({ email: "niemand@example.com" }));
    state.result = { email: "pia@example.com", token: "tok" };
    const known = await POST(post({ email: "pia@example.com" }));
    for (const res of [unknown, known]) {
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ message: FORGOT_RESPONSE_MESSAGE });
    }
    expect(state.requestPasswordReset).not.toHaveBeenCalled();
    expect(state.afterTasks).toHaveLength(2);
  });

  it("verschickt nach der Antwort eine Mail mit Link nur für ein aktives Konto", async () => {
    await POST(post({ email: "niemand@example.com" }));
    await runAfterTasks();
    expect(state.sendMail).not.toHaveBeenCalled();

    state.result = { email: "pia@example.com", token: "abc_DEF-123" };
    await POST(post({ email: " PiA@example.com " }));
    await runAfterTasks();
    expect(state.requestPasswordReset).toHaveBeenLastCalledWith(expect.anything(), "pia@example.com");
    expect(state.sendMail).toHaveBeenCalledTimes(1);
    const mail = state.sendMail.mock.calls[0][0] as { to: string; subject: string; text: string };
    expect(mail.to).toBe("pia@example.com");
    expect(mail.subject).toBe("theraPiA: Passwort zurücksetzen");
    expect(mail.text).toContain("https://therapia.beispiel-institut.de/auth/reset?token=abc_DEF-123");
    expect(mail.text).toContain("1 Stunde");
  });

  it("protokolliert einen Versandfehler ohne Adresse und ohne Token", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    state.result = { email: "pia@example.com", token: "geheimes-token" };
    state.sendMail.mockRejectedValueOnce(Object.assign(new Error("Invalid login: pia@example.com"), { code: "EAUTH" }));
    await POST(post({ email: "pia@example.com" }));
    await expect(runAfterTasks()).resolves.toBeUndefined();
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("EAUTH");
    expect(logged).not.toContain("pia@example.com");
    expect(logged).not.toContain("geheimes-token");
    log.mockRestore();
  });
});
