import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/require-session";
import { loadAdminOverview } from "@/lib/services/admin-overview";
import { AdminClient } from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") redirect("/");
  const data = await loadAdminOverview(db);
  return <AdminClient initialData={data} currentUserId={session.user.id} />;
}
