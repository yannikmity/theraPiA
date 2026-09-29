import { db } from "@/lib/db";
import { requireSession } from "@/lib/require-session";
import { loadRegelwerk } from "@/lib/services/ausbildungsregeln";
import { RegelAbweichungenForm } from "./RegelAbweichungenForm";

export const dynamic = "force-dynamic";

// Persönliche Ausbildungsregeln (#8): nur der eigene Account.
export default async function MeineRegelnPage() {
  const session = await requireSession();
  return <RegelAbweichungenForm initial={await loadRegelwerk(db, session.user.id)} />;
}
