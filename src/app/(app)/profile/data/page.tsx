import { requireSession } from "@/lib/require-session";
import { PageHeader } from "@/components/layout/PageHeader";
import { DeleteAccountForm } from "./DeleteAccountForm";
import { ExportLinks } from "./ExportLinks";

export default async function MyDataPage() {
  const session = await requireSession();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Meine Daten" backHref="/profile" subtitle="Export und Account löschen (Art. 17 und 20 DSGVO)" />
      <ExportLinks />
      <DeleteAccountForm isAdmin={session.user.role === "admin"} />
    </div>
  );
}
