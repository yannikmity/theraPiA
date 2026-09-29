import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { connection } from "next/server";
import { UmamiLoader } from "@/components/analytics/UmamiLoader";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TheraPIA – Ausbildungs-Tracker",
  description: "Stundenerfassung und Supervisions-Tracking für PiA",
  manifest: "/manifest.json",
};

// viewport-fit=cover: erst damit liefern env(safe-area-inset-*) auf iPhones Werte – Bottom-Navigation, Feedback-Knopf
// (fab-zone.ts) und Kopfzeile halten die Bereiche um Notch und Home-Indikator frei (#43). Bewusst kein maximum-scale:
// Zoomen muss möglich bleiben (WCAG 1.4.4, #56); das automatische Hineinzoomen von iOS bei Feldern verhindert die
// 16-px-Schrift am Handy (Input, Textarea, NativeSelect).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2471a3" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1a24" },
  ],
};

// Jede Seite wird pro Anfrage gerendert: Der Proxy (src/proxy.ts) setzt eine CSP mit Nonce pro Anfrage, und Next
// hängt diese Nonce beim Rendern an seine Skripte. Vorgerendertes HTML hätte keine Nonce – der Browser würde alle
// Skripte blockieren. Deshalb connection() hier im Layout, unabhängig davon, ob Umami eingeschaltet ist.
// Partial Prerendering/cacheComponents vertragen sich nicht mit Nonces (Next-Doku „Content Security Policy“).
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  return (
    <html lang="de">
      <body className={inter.className}>
        {children}
        <UmamiLoader />
      </body>
    </html>
  );
}
