import { parseISO } from "date-fns";
import { db } from "@/lib/db";
import { requireSession } from "@/lib/require-session";
import { todayIso } from "@/lib/dates";
import { resolveNachweisFilter, type NachweisSearchParams } from "@/lib/nachweis-filter";
import { nachweisHref } from "@/lib/nachweis-periods";
import { loadNachweisPage } from "@/lib/services/nachweis";
import { NachweisDocument } from "@/components/nachweis/NachweisDocument";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { NachweisFilterForm } from "./NachweisFilterForm";
import { PrintButton } from "./PrintButton";

// Nachweis je Zeitraum und Supervisor:in. Der Filter steht in der Adresse (siehe NachweisFilterForm); das Dokument
// rendert der Server. Beim Drucken bleiben nur das Dokument (print:-Regeln) – Kopf, Hinweise, Filter und Knopf sind
// print:hidden, Navigation und Feedback-Widget blendet der App-Rahmen aus.
export default async function NachweisPage({ searchParams }: { searchParams: Promise<NachweisSearchParams> }) {
  const session = await requireSession();
  const now = new Date();
  // Kalendertage gelten in Europe/Berlin (der Server läuft meist in UTC): Vorgaben und Rückfall-Quartal rechnen
  // aus dem Berliner „heute“, Formular und Seite aus demselben Wert. `now` bleibt der Erstellungszeitpunkt.
  const today = todayIso(now);
  const { filter, invalid } = resolveNachweisFilter(await searchParams, parseISO(today));
  const page = await loadNachweisPage(db, session.user.id, filter, now);
  const effective = {
    from: page.nachweis.period.from,
    to: page.nachweis.period.to,
    supervisorId: page.nachweis.supervisor?.id ?? null,
  };
  const notices = [
    invalid ? "Der Zeitraum in der Adresse war ungültig – angezeigt wird das aktuelle Quartal." : null,
    page.supervisorNotFound ? "Die Supervisor:in aus der Adresse gibt es nicht – angezeigt werden alle Supervisionen." : null,
  ].filter((notice): notice is string => notice !== null);

  return (
    <div className="mx-auto max-w-4xl space-y-4 print:max-w-none print:space-y-0">
      <PageHeader
        title="Nachweis"
        subtitle="Zum Ausdrucken und Unterschreiben – Sitzungen je Zeitraum und Supervisor:in"
        actions={<PrintButton supervisor={page.nachweis.supervisor !== null} />}
        className="print:hidden"
      />
      {notices.map((notice) => (
        <Alert key={notice} variant="info" className="print:hidden">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ))}
      <Card className="print:hidden">
        <NachweisFilterForm
          key={nachweisHref(effective)}
          filter={effective}
          supervisors={page.supervisors}
          firstRecordDate={page.firstRecordDate}
          today={today}
        />
      </Card>
      <Card className="print:rounded-none print:border-0 print:bg-transparent print:p-0 print:shadow-none">
        <NachweisDocument nachweis={page.nachweis} />
      </Card>
    </div>
  );
}
