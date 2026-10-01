import nodemailer from "nodemailer";
import { getConfig, type AppConfig } from "./config";

// Mailversand über einen beliebigen SMTP-Anbieter der Instanz. Ohne Konfiguration aus; die App funktioniert dann
// ohne Mails (Reset-Links nur über die Administration).
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export function isMailEnabled(config: AppConfig = getConfig()): boolean {
  return Boolean(config.SMTP_HOST);
}

type Transport = ReturnType<typeof nodemailer.createTransport>;
let transport: Transport | undefined;

function getTransport(config: AppConfig): Transport {
  // Port 465 = TLS ab dem ersten Byte, sonst STARTTLS. In Produktion nie Klartext: ohne STARTTLS bricht der Versand ab,
  // statt Zugangsdaten und Reset-Link unverschlüsselt zu senden. Lokal (z. B. Mailpit) ist Klartext erlaubt.
  const implicitTls = config.SMTP_PORT === 465;
  transport ??= nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: implicitTls,
    requireTLS: !implicitTls && process.env.NODE_ENV === "production",
    auth: { user: config.SMTP_USER!, pass: config.SMTP_PASSWORD! },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const config = getConfig();
  if (!isMailEnabled(config)) {
    throw new Error("Mailversand ist nicht konfiguriert");
  }
  await getTransport(config).sendMail({
    from: config.MAIL_FROM,
    replyTo: config.MAIL_REPLY_TO,
    to: message.to,
    subject: message.subject,
    text: message.text,
  });
}

/** Nur für Tests: gecachten Transport verwerfen. */
export function resetMailTransportForTests(): void {
  transport = undefined;
}
