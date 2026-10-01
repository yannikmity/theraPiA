import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isMailEnabled } from "@/lib/mail";
import { ForgotForm } from "./ForgotForm";

// Die Mail-Konfiguration wird zur Laufzeit gelesen – ein Image für alle Instanzen.
export const dynamic = "force-dynamic";

export default async function ForgotPage() {
  // DB-geprüft wie auf der Login-Seite: nur eine noch gültige Sitzung wird weitergeleitet.
  const session = await auth();
  if (session?.user?.id) {
    redirect("/");
  }
  return <ForgotForm mailEnabled={isMailEnabled()} />;
}
