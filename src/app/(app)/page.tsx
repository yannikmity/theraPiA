import { PlusCircle, Clock, BookOpen } from "lucide-react";
import Link from "next/link";
import { requireSession } from "@/lib/require-session";
import { loadDashboard, type DashboardData } from "./load-dashboard";
import ProgressBar from "@/components/ProgressBar";
import RatioIndicator from "@/components/RatioIndicator";
import { QuickCaptureLink } from "@/components/QuickCaptureLink";
import { QuarterForecastCard } from "@/components/dashboard/QuarterForecastCard";
import { TherapyHoursCard } from "@/components/dashboard/TherapyHoursCard";
import { SupervisionStatusCard } from "@/components/dashboard/SupervisionStatusCard";
import { SectionHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";

// Drei Alltagsfragen auf einen Blick (#6): Geld zum Quartalsende, Behandlungsstunden, Supervision – danach Erfassen,
// Fachkunde Gruppe, Patient:innen mit Schnelleinstieg „+ Sitzung“ (#5) und die letzten Einträge. Laden, Rechnen und
// Formatieren in loadDashboard (load-dashboard.ts), im try; Renderfehler fängt error.tsx (#56).
export default async function Dashboard() {
  await requireSession();

  let data: DashboardData;
  try {
    data = await loadDashboard();
  } catch (error) {
    console.error("Dashboard error:", error);
    return (
      <Card className="text-center">
        <p className="text-destructive">Fehler beim Laden der Daten. Bitte versuchen Sie später erneut.</p>
      </Card>
    );
  }
  const {
    settings,
    regeln,
    therapyH,
    supervisionH,
    overallRatio,
    categoryHours,
    unsupervisedCount,
    forecast,
    groupCounts,
    ambulanzzeitLeft,
    recentEntries,
    patientRatios,
  } = data;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <PageHeader title="Dashboard" className="md:col-span-2" />

      <QuarterForecastCard forecast={forecast} incomePerHour={settings.incomePerHour} />

      <TherapyHoursCard hours={therapyH} target={regeln.behandlungsstundenZiel} categoryHours={categoryHours} />

      <SupervisionStatusCard
        therapyHours={therapyH}
        supervisionHours={supervisionH}
        ratio={overallRatio}
        regeln={regeln}
        unsupervisedCount={unsupervisedCount}
      />

      <Button asChild variant="success" size="lg" className="w-full md:col-span-2 md:w-auto md:justify-self-start">
        <Link href="/sessions/new">
          <PlusCircle />
          Stunde erfassen
        </Link>
      </Button>

      <Card>
        <SectionHeader>Fachkunde Gruppe</SectionHeader>
        <ProgressBar
          current={groupCounts.durchgefuehrt}
          target={regeln.gruppeDoppelstundenZiel}
          label="Doppelstunden gesamt"
          color="blue"
        />
        <ProgressBar
          current={groupCounts.ambulanzzeitCount}
          target={regeln.gruppeAmbulanzzeitZiel}
          label="davon in Ambulanzzeit"
          color="green"
        />
        <p className="text-xs text-muted-foreground">
          Noch {Math.max(ambulanzzeitLeft, 0)} Doppelstunden Ambulanzzeit übrig
        </p>
      </Card>

      {patientRatios.length > 0 && (
        <Card>
          <SectionHeader>Verhältnis pro Patient:in</SectionHeader>
          {/* Zeile = Link zur Patient:in plus eigener Schnelleinstieg daneben (kein Link im Link). */}
          <div className="-mx-1">
            {patientRatios.map(({ patient, ratio }) => (
              <div key={patient.id} className="flex items-center gap-1">
                <Link
                  href={`/patients/${patient.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between rounded-lg px-1 py-2 transition-colors hover:bg-muted"
                >
                  <span className="font-mono text-sm font-medium text-foreground">{patient.chiffre}</span>
                  <RatioIndicator ratio={ratio} compact />
                </Link>
                <QuickCaptureLink patientId={patient.id} chiffre={patient.chiffre} source="dashboard" compact />
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="md:col-span-2">
        <div className="flex items-center justify-between">
          <SectionHeader>Letzte Einträge</SectionHeader>
          <Link href="/supervision" className="text-xs font-medium text-primary hover:underline">
            Alle Supervisionen
          </Link>
        </div>
        {recentEntries.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Noch keine Einträge vorhanden</p>
        ) : (
          <div className="-mx-1 divide-y divide-border">
            {recentEntries.map((entry) => (
              <Link
                key={entry.key}
                href={entry.href}
                className="flex items-center justify-between rounded-lg px-1 py-2 transition-colors hover:bg-muted"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`rounded-lg p-1.5 ${
                      entry.type === "therapie" ? "bg-primary-soft text-primary" : "bg-success-soft text-success"
                    }`}
                  >
                    {entry.type === "therapie" ? (
                      <Clock size={16} aria-hidden="true" />
                    ) : (
                      <BookOpen size={16} aria-hidden="true" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{entry.label}</p>
                    <p className="text-xs text-muted-foreground">{entry.dateLabel}</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium text-foreground">{entry.duration} Min</span>
                  <p className="text-[10px] text-muted-foreground uppercase">
                    {entry.type === "therapie" ? "Therapie" : "Supervision"}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
