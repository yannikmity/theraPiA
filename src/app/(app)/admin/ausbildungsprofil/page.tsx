import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/require-session";
import { loadAusbildungsprofilDaten } from "@/lib/services/ausbildungsregeln";
import { AusbildungsprofilForm } from "./AusbildungsprofilForm";

export const dynamic = "force-dynamic";

// Ausbildungsprofil der Instanz (#8) – nur für Admins (wie /admin).
export default async function AusbildungsprofilPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") redirect("/");
  return <AusbildungsprofilForm initial={await loadAusbildungsprofilDaten(db)} />;
}
