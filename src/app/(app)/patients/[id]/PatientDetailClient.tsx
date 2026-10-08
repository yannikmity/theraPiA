"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Clock, BookOpen, CheckCircle, Pencil, Trash2 } from "lucide-react";
import {
  calculatePatientRatio,
  remainingContingentForPatient,
  bezugspersonenStundenForPatient,
  roundUnits,
} from "@/lib/calculations";
import { formatDecimal } from "@/lib/csv";
import { todayIso } from "@/lib/dates";
import { gespraechsziffernKontingent, probatorikKontingent, sprechstundenKontingent } from "@/lib/kontingente";
import { CATEGORY_LABELS } from "@/lib/labels";
import { Patient, TherapySession, SupervisionSession, Supervisor } from "@/types";
import type { Ausbildungsregeln } from "@/lib/ausbildungsregeln/model";
import RatioIndicator from "@/components/RatioIndicator";
import { ActionError, errorAt, type ScopedActionError } from "@/components/ActionError";
import { runAction } from "@/lib/run-action";
import { track, trackFailure } from "@/lib/analytics/track";
import { SectionHeader, FormField, ConfirmButton } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { QuickCaptureLink } from "@/components/QuickCaptureLink";
import {
  updatePatient,
  updateTherapySession,
  deleteTherapySession,
  deletePatient,
  type PatientDetailData,
} from "./actions";
import { TherapySessionEditForm, type TherapySessionFormValues } from "./TherapySessionEditForm";
import { ContingentTile } from "./ContingentTile";
import { KontingentTile } from "./KontingentTile";

// Sitzungen, die mit der Patient:in verschwinden – ohne „1 Sitzungen“ und ohne „Sitzung(en)“ (#28).
function mitgeloescht(n: number): string {
  if (n === 0) return "Es sind keine Therapiesitzungen erfasst";
  if (n === 1) return "Die einzige Therapiesitzung wird mitgelöscht";
  return `Alle ${n} Therapiesitzungen werden mitgelöscht`;
}

interface PatientDetailClientProps {
  initialPatient: Patient | undefined;
  initialTherapySessions: TherapySession[];
  initialSupervisionSessions: SupervisionSession[];
  initialSupervisors: Supervisor[];
  regeln: Ausbildungsregeln;
}

export function PatientDetailClient({
  initialPatient,
  initialTherapySessions,
  initialSupervisionSessions,
  initialSupervisors,
  regeln,
}: PatientDetailClientProps) {
  const [patient, setPatient] = useState<Patient | undefined>(initialPatient);
  const [therapySessions, setTherapySessions] = useState(initialTherapySessions);
  const [supervisionSessions, setSupervisionSessions] = useState(initialSupervisionSessions);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<ScopedActionError | null>(null);
  const [antragsdatum, setAntragsdatum] = useState(initialPatient?.antragsdatum ?? "");
  const [beantragteStunden, setBeantragteStunden] = useState(
    initialPatient?.beantragteStunden?.toString() ?? ""
  );
  const [genehmigungsdatum, setGenehmigungsdatum] = useState(initialPatient?.genehmigungsdatum ?? "");
  const [sprechstundenAmbulanz, setSprechstundenAmbulanz] = useState(String(initialPatient?.sprechstundenAmbulanz ?? 0));
  const router = useRouter();

  if (!patient) return null;

  // Alle Actions liefern den kompletten Seitenstand zurück, damit Stunden, Verhältnis und
  // SV-Markierungen nach jeder Änderung stimmen.
  function applyData(data: PatientDetailData) {
    setPatient(data.patient);
    setTherapySessions(data.therapySessions);
    setSupervisionSessions(data.supervisionSessions);
  }

  // Alle Änderungen an der Patient:in gehen durch eine Action mit dem vollen Datensatz; `changes` überschreibt die
  // Felder, die die jeweilige Stelle ändert. Der Fehler landet an genau dieser Stelle (scope).
  async function savePatient(
    scope: "antrag" | "status",
    changes: Partial<
      Pick<Patient, "endDate" | "isActive" | "antragsdatum" | "beantragteStunden" | "genehmigungsdatum" | "sprechstundenAmbulanz">
    >
  ) {
    if (!patient) return;
    setIsSaving(true);
    setError(null);
    const result = await runAction(() =>
      updatePatient({
        id: patient.id,
        chiffre: patient.chiffre,
        therapyType: patient.therapyType,
        startDate: patient.startDate,
        endDate: patient.endDate,
        isActive: patient.isActive,
        antragsdatum: patient.antragsdatum,
        beantragteStunden: patient.beantragteStunden,
        genehmigungsdatum: patient.genehmigungsdatum,
        sprechstundenAmbulanz: patient.sprechstundenAmbulanz,
        ...changes,
      })
    );
    setIsSaving(false);
    if (result.success) {
      applyData(result.data);
    } else {
      trackFailure("patient", "update", result);
      setError({ scope, result });
    }
  }

  const handleComplete = () => savePatient("status", { endDate: format(new Date(), "yyyy-MM-dd"), isActive: false });
  const handleReopen = () => savePatient("status", { endDate: null, isActive: true });
  const handleSaveAntrag = () =>
    savePatient("antrag", {
      antragsdatum: antragsdatum || null,
      beantragteStunden: beantragteStunden ? Number(beantragteStunden) : null,
      genehmigungsdatum: genehmigungsdatum || null,
      sprechstundenAmbulanz: Number(sprechstundenAmbulanz) || 0,
    });

  async function handleUpdateSession(session: TherapySession, values: TherapySessionFormValues) {
    setIsSaving(true);
    setError(null);
    const result = await runAction(() => updateTherapySession({ id: session.id, patientId: session.patientId, ...values }));
    setIsSaving(false);
    if (result.success) {
      track("therapy_session_saved", { mode: "edit" });
      applyData(result.data);
      setEditingSessionId(null);
    } else {
      trackFailure("therapy_session", "update", result);
      setError({ scope: `session:${session.id}`, result });
    }
  }

  async function handleDeleteSession(session: TherapySession) {
    setIsSaving(true);
    setError(null);
    const result = await runAction(() => deleteTherapySession({ id: session.id, patientId: session.patientId }));
    setIsSaving(false);
    if (result.success) {
      track("entry_deleted", { entity: "therapy_session" });
      applyData(result.data);
    } else {
      trackFailure("therapy_session", "delete", result);
      setError({ scope: `session:${session.id}`, result });
    }
  }

  async function handleDeletePatient() {
    if (!patient) return;
    setIsSaving(true);
    setError(null);
    const result = await runAction(() => deletePatient({ id: patient.id }));
    if (result.success) {
      track("entry_deleted", { entity: "patient" });
      // isSaving bleibt true, bis die Liste geladen ist – verhindert Doppelklicks.
      router.push("/patients");
      return;
    }
    trackFailure("patient", "delete", result);
    setError({ scope: "delete", result });
    setIsSaving(false);
  }

  const ratio = calculatePatientRatio(patient, therapySessions, supervisionSessions, regeln);
  const remaining = remainingContingentForPatient(patient, therapySessions);
  const bezugspersonenStunden = roundUnits(bezugspersonenStundenForPatient(therapySessions, patient.id));
  const patientTherapySessions = therapySessions
    .filter((s) => s.patientId === patient.id)
    .sort((a, b) => b.date.localeCompare(a.date));

  const patientSessionIds = new Set(patientTherapySessions.map((s) => s.id));
  // Supervisionen mit Anteil dieser Patient:in (#40) oder mit verknüpfter Sitzung; angezeigt wird der Anteil.
  const shareOf = (sv: SupervisionSession) => sv.caseShares.find((c) => c.patientId === patient.id)?.minutes;
  const linkedSupervisions = supervisionSessions
    .filter((sv) => shareOf(sv) !== undefined || sv.linkedTherapySessionIds.some((id) => patientSessionIds.has(id)))
    .sort((a, b) => b.date.localeCompare(a.date));

  const supervisedIds = new Set(
    linkedSupervisions.flatMap((sv) => sv.linkedTherapySessionIds)
  );

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={<span className="font-mono">{patient.chiffre}</span>}
        backHref="/patients"
        actions={
          patient.isActive ? <QuickCaptureLink patientId={patient.id} chiffre={patient.chiffre} source="patient" /> : undefined
        }
        subtitle={
          <div className="flex items-center gap-2">
            <Badge variant="primary-soft">
              {patient.therapyType === "kurzzeittherapie" ? "Kurzzeittherapie" : "Langzeittherapie"}
            </Badge>
            {patient.isActive ? <Badge variant="success-soft">Aktiv</Badge> : <Badge variant="muted">Abgeschlossen</Badge>}
          </div>
        }
      />

      {/* wrap-anywhere: lange Zahlen (z. B. ungerundete Stunden) brechen in der Kachel um statt die Seite zu verbreitern. */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="text-center">
          <p className="text-2xl font-bold wrap-anywhere text-primary">{formatDecimal(ratio.therapyHours, 1)}</p>
          <p className="text-xs text-muted-foreground">Behandlungsstunden</p>
        </Card>
        <Card className="text-center">
          <p className="text-2xl font-bold wrap-anywhere text-success">{formatDecimal(ratio.supervisionHours, 1)}</p>
          <p className="text-xs text-muted-foreground">SV-Einheiten</p>
        </Card>
      </div>

      <RatioIndicator ratio={ratio} />

      <div className="grid grid-cols-2 gap-3">
        <ContingentTile remaining={remaining} />
        <Card className="text-center">
          <p className="text-2xl font-bold wrap-anywhere text-foreground">{formatDecimal(bezugspersonenStunden, 1)}</p>
          <p className="text-xs text-muted-foreground">Bezugspersonenstunden</p>
        </Card>
      </div>

      {/* Auf dem Handy untereinander: die Beschriftungen sind für drei Spalten zu lang. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KontingentTile titel="Sprechstunde" einheit="Termine" kontingent={sprechstundenKontingent(patient, therapySessions)} />
        <KontingentTile titel="Probatorik" einheit="Sitzungen" kontingent={probatorikKontingent(patient, therapySessions)} />
        <KontingentTile titel="Gesprächsziffern im Quartal" einheit="Ziffern" kontingent={gespraechsziffernKontingent(patient, therapySessions, todayIso())} />
      </div>

      <Card>
        <SectionHeader>Antrag</SectionHeader>
        <FormField label="Antragsdatum" htmlFor="antragsdatum">
          <Input
            id="antragsdatum"
            type="date"
            value={antragsdatum ?? ""}
            onChange={(e) => setAntragsdatum(e.target.value)}
            disabled={isSaving}
          />
        </FormField>
        <FormField label="Genehmigt am" htmlFor="genehmigungsdatum">
          <Input
            id="genehmigungsdatum"
            type="date"
            value={genehmigungsdatum}
            onChange={(e) => setGenehmigungsdatum(e.target.value)}
            disabled={isSaving}
          />
        </FormField>
        <FormField label="Beantragte Behandlungsstunden" htmlFor="beantragte-stunden">
          <Input
            id="beantragte-stunden"
            type="number"
            value={beantragteStunden}
            onChange={(e) => setBeantragteStunden(e.target.value)}
            placeholder="z. B. 60"
            min={1}
            disabled={isSaving}
          />
        </FormField>
        <FormField label="Sprechstunden durch die Ambulanzleitung" htmlFor="sprechstunden-ambulanz">
          <Input
            id="sprechstunden-ambulanz"
            type="number"
            inputMode="numeric"
            min={0}
            max={10}
            value={sprechstundenAmbulanz}
            onChange={(e) => setSprechstundenAmbulanz(e.target.value)}
            disabled={isSaving}
          />
        </FormField>
        <p className="text-xs text-muted-foreground">
          Von den 10 Sprechstunden je Fall übernimmt die Ambulanzleitung oft einige, meist 2. Das Behandlungsstunden-Kontingent
          zählt ab „Genehmigt am“, ohne Datum ab dem Antragsdatum.
        </p>
        <ActionError result={errorAt(error, "antrag")} />
        <Button variant="outline" onClick={handleSaveAntrag} loading={isSaving} className="w-full">
          Antrag speichern
        </Button>
      </Card>

      <Card>
        <p className="text-sm text-muted-foreground">
          Behandlungszeitraum:{" "}
          <span className="font-medium text-foreground">{format(parseISO(patient.startDate), "dd.MM.yyyy")}</span>
          {patient.endDate && (
            <>
              {" "}
              – <span className="font-medium text-foreground">{format(parseISO(patient.endDate), "dd.MM.yyyy")}</span>
            </>
          )}
          {!patient.endDate && <span> – laufend</span>}
        </p>
      </Card>

      <ActionError result={errorAt(error, "status")} />
      {patient.isActive ? (
        <Button variant="outline" onClick={handleComplete} loading={isSaving} className="w-full">
          <CheckCircle /> Behandlung abschließen
        </Button>
      ) : (
        <Button
          variant="outline"
          onClick={handleReopen}
          loading={isSaving}
          className="w-full border-primary/40 text-primary hover:bg-primary-soft"
        >
          Behandlung wieder öffnen
        </Button>
      )}

      <Card>
        <SectionHeader>Therapiesitzungen ({patientTherapySessions.length})</SectionHeader>
        {patientTherapySessions.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Noch keine Sitzungen</p>
        ) : (
          <div className="divide-y divide-border">
            {patientTherapySessions.map((session) =>
              editingSessionId === session.id ? (
                <div key={session.id}>
                  <TherapySessionEditForm
                    session={session}
                    saving={isSaving}
                    onSave={(values) => handleUpdateSession(session, values)}
                    onCancel={() => {
                      setEditingSessionId(null);
                      setError(null);
                    }}
                  />
                  <ActionError result={errorAt(error, `session:${session.id}`)} />
                </div>
              ) : (
                <div key={session.id} className="flex flex-wrap items-center gap-x-2 gap-y-2 py-2">
                  <Clock size={14} className="shrink-0 text-primary" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-foreground">
                      {format(parseISO(session.date), "dd. MMM yyyy", { locale: de })}
                    </span>
                    <span className="ml-2 text-xs text-muted-foreground">{CATEGORY_LABELS[session.category]}</span>
                    {session.notes && <p className="truncate text-xs text-muted-foreground">{session.notes}</p>}
                  </div>
                  <span className="text-sm text-muted-foreground">{session.durationMinutes} Min</span>
                  {supervisedIds.has(session.id) && (
                    <Badge variant="success-soft" className="text-[10px]">
                      SV
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setEditingSessionId(session.id);
                      setError(null);
                    }}
                    disabled={isSaving}
                    aria-label="Sitzung bearbeiten"
                  >
                    <Pencil />
                  </Button>
                  <ConfirmButton
                    ariaLabel="Sitzung löschen"
                    label={<Trash2 size={16} />}
                    question={`Sitzung vom ${format(parseISO(session.date), "dd.MM.yyyy")} wirklich löschen?`}
                    description={
                      supervisedIds.has(session.id)
                        ? "Die Zuordnung zur Supervision wird entfernt, die Supervision selbst bleibt bestehen."
                        : undefined
                    }
                    onConfirm={() => handleDeleteSession(session)}
                    loading={isSaving}
                    className="size-8 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                  />
                  <ActionError result={errorAt(error, `session:${session.id}`)} />
                </div>
              )
            )}
          </div>
        )}
      </Card>

      {linkedSupervisions.length > 0 && (
        <Card>
          <SectionHeader>Zugeordnete Supervisionen ({linkedSupervisions.length})</SectionHeader>
          <div className="divide-y divide-border">
            {linkedSupervisions.map((sv) => {
              const supervisor = initialSupervisors.find((s) => s.id === sv.supervisorId);
              return (
                <div key={sv.id} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-2">
                    <BookOpen size={14} className="text-success" aria-hidden="true" />
                    <div>
                      <span className="text-sm text-foreground">
                        {format(parseISO(sv.date), "dd. MMM yyyy", { locale: de })}
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">{supervisor?.name}</span>
                    </div>
                  </div>
                  <span className="text-sm text-muted-foreground">{shareOf(sv) ?? sv.durationMinutes} Min</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <SectionHeader>Patient:in löschen</SectionHeader>
        <p className="text-xs text-muted-foreground">
          Entfernt die Patient:in dauerhaft. {mitgeloescht(patientTherapySessions.length)}; ihre Dauer in Supervisionen mit
          weiteren Patient:innen entfällt, Supervisionen nur zu dieser Patient:in werden mitgelöscht.
        </p>
        <ActionError result={errorAt(error, "delete")} />
        <ConfirmButton
          label={
            <>
              <Trash2 size={16} /> Patient:in löschen
            </>
          }
          question={`Patient:in ${patient.chiffre} wirklich löschen?`}
          description={`${mitgeloescht(patientTherapySessions.length)}. Das lässt sich nicht rückgängig machen.`}
          confirmLabel="Ja, endgültig löschen"
          onConfirm={handleDeletePatient}
          loading={isSaving}
          className="h-10 w-full border border-destructive/40 px-4 text-destructive hover:bg-destructive-soft"
        />
      </Card>
    </div>
  );
}
