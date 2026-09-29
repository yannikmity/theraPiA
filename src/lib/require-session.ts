import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "./auth";

// Einmal pro Anfrage: das (app)-Layout braucht die Rolle für die Navigation, die Seite den Zugriffsschutz –
// beide teilen sich dieselbe DB-geprüfte Sitzung statt zweimal gegen die Datenbank zu prüfen.
export const getSession = cache(() => auth());

// Für Server-Component-Seiten: prüft die Sitzung gegen die Datenbank und leitet bei
// fehlender, gesperrter oder entwerteter Sitzung zum Login um, statt später an
// getCurrentUserId() mit einer Fehlerseite zu scheitern. Nicht in Server Actions
// oder API-Routen verwenden.
export async function requireSession() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/auth/login");
  }
  return session;
}
