// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AppConfig } from "../config";

const state = vi.hoisted(() => ({
  config: {} as Partial<AppConfig>,
  sendMail: vi.fn(async () => ({ messageId: "x" })),
  createTransport: vi.fn(),
}));

vi.mock("nodemailer", () => {
  state.createTransport.mockImplementation(() => ({ sendMail: state.sendMail }));
  return { default: { createTransport: state.createTransport }, createTransport: state.createTransport };
});
vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config")>()),
  getConfig: () => state.config,
}));

import { isMailEnabled, sendMail, resetMailTransportForTests } from "../mail";

const SMTP: Partial<AppConfig> = {
  SMTP_HOST: "smtp.example.net",
  SMTP_PORT: 587,
  SMTP_USER: "nutzer",
  SMTP_PASSWORD: "geheim",
  MAIL_FROM: "theraPiA <noreply@example.net>",
};
const MESSAGE = { to: "pia@example.com", subject: "Betreff", text: "Text" };

describe("Mail-Modul", () => {
  beforeEach(() => {
    resetMailTransportForTests();
    state.createTransport.mockClear();
    state.sendMail.mockClear();
    state.config = { ...SMTP };
    vi.unstubAllEnvs();
  });

  it("ist ohne SMTP_HOST aus und mit vollständiger Konfiguration an", () => {
    expect(isMailEnabled({} as AppConfig)).toBe(false);
    expect(isMailEnabled(SMTP as AppConfig)).toBe(true);
  });

  it("verschickt nur Text mit Absender und Antwortadresse aus der Konfiguration", async () => {
    state.config = { ...SMTP, MAIL_REPLY_TO: "kontakt@example.net" };
    await sendMail(MESSAGE);
    expect(state.sendMail).toHaveBeenCalledWith({
      from: "theraPiA <noreply@example.net>",
      replyTo: "kontakt@example.net",
      to: "pia@example.com",
      subject: "Betreff",
      text: "Text",
    });
  });

  it("baut den Transport einmal und nutzt ihn wieder", async () => {
    await sendMail(MESSAGE);
    await sendMail(MESSAGE);
    expect(state.createTransport).toHaveBeenCalledTimes(1);
  });

  it("verlangt in Produktion STARTTLS auf Port 587", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await sendMail(MESSAGE);
    expect(state.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.example.net", port: 587, secure: false, requireTLS: true, auth: { user: "nutzer", pass: "geheim" } })
    );
  });

  it("nutzt auf Port 465 implizites TLS", async () => {
    state.config = { ...SMTP, SMTP_PORT: 465 };
    await sendMail(MESSAGE);
    expect(state.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }));
  });

  it("erlaubt lokal Klartext-SMTP (z. B. Mailpit)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await sendMail(MESSAGE);
    expect(state.createTransport).toHaveBeenCalledWith(expect.objectContaining({ requireTLS: false }));
  });

  it("wirft ohne Konfiguration, statt still nichts zu tun", async () => {
    state.config = {};
    await expect(sendMail(MESSAGE)).rejects.toThrow("nicht konfiguriert");
    expect(state.createTransport).not.toHaveBeenCalled();
  });
});
