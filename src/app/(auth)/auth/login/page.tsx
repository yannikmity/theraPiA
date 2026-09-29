import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./LoginForm";

const NOTICES: Record<string, string> = {
  registered: "Registrierung abgeschlossen. Bitte anmelden – war die Adresse schon registriert, gilt weiterhin das bisherige Passwort.",
  passwordChanged: "Passwort geändert. Bitte neu anmelden.",
  reset: "Passwort zurückgesetzt. Bitte neu anmelden.",
  accountDeleted: "Account gelöscht. Alle Daten wurden entfernt.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ registered?: string; passwordChanged?: string; reset?: string; accountDeleted?: string }>;
}) {
  // DB-geprüft: nur eine noch gültige Sitzung wird weitergeleitet, eine entwertete landet hier.
  const session = await auth();
  if (session?.user?.id) {
    redirect("/");
  }

  const params = await searchParams;
  const key = Object.keys(NOTICES).find((k) => params[k as keyof typeof params] === "true");
  return <LoginForm notice={key ? NOTICES[key] : null} />;
}
