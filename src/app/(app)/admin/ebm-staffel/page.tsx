import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { todayIso } from "@/lib/dates";
import { requireSession } from "@/lib/require-session";
import { loadEbmStaffelnFuerPflege } from "@/lib/services/ausbildungsregeln";
import { EbmStaffelClient } from "./EbmStaffelClient";

export const dynamic = "force-dynamic";

// EBM-Staffel der Instanz (#8) – nur für Admins. „Heute“ ist der Berliner Kalendertag (todayIso) und kommt vom Server,
// damit Vorgabe-Datum und „gilt heute“ nicht von der Uhr des Browsers abhängen.
export default async function EbmStaffelPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") redirect("/");
  return <EbmStaffelClient initial={await loadEbmStaffelnFuerPflege(db)} heute={todayIso()} />;
}
