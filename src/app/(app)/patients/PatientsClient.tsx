"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Plus, ChevronRight, X } from "lucide-react";
import { calculatePatientRatio, supervisionDuePatientIds, therapyHoursForPatient } from "@/lib/calculations";
import { formatDecimal } from "@/lib/csv";
import { Patient, TherapySession, SupervisionSession } from "@/types";
import type { Ausbildungsregeln } from "@/lib/ausbildungsregeln/model";
import RatioIndicator from "@/components/RatioIndicator";
import { SupervisionDueBadge } from "@/components/SupervisionDueBadge";
import { ActionError } from "@/components/ActionError";
import { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/run-action";
import { track, trackFailure } from "@/lib/analytics/track";
import { FormField, SectionHeader } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PageHeader } from "@/components/layout/PageHeader";
import { addPatient } from "./actions";

interface PatientsClientProps {
  initialPatients: Patient[];
  initialTherapySessions: TherapySession[];
  initialSupervisionSessions: SupervisionSession[];
  regeln: Ausbildungsregeln;
}

export function PatientsClient({
  initialPatients,
  initialTherapySessions,
  initialSupervisionSessions,
  regeln,
}: PatientsClientProps) {
  const [patients, setPatients] = useState(initialPatients);
  const [showForm, setShowForm] = useState(false);
  const [newChiffre, setNewChiffre] = useState("");
  const [newType, setNewType] = useState<"kurzzeittherapie" | "langzeittherapie">("langzeittherapie");
  const [newStartDate, setNewStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isSaving, setIsSaving] = useState(false);
  // Sperre gegen doppeltes Absenden: greift sofort, noch bevor isSaving neu gerendert ist.
  const savingRef = useRef(false);
  const [error, setError] = useState<ActionResult<unknown> | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current || !newChiffre.trim()) return;
    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    const result = await runAction(() => addPatient({ chiffre: newChiffre.trim(), therapyType: newType, startDate: newStartDate }));
    savingRef.current = false;
    setIsSaving(false);
    if (result.success) {
      track("patient_created");
      setPatients(result.data.patients);
      setNewChiffre("");
      setShowForm(false);
    } else {
      trackFailure("patient", "create", result);
      setError(result);
    }
  }

  const active = patients.filter((p) => p.isActive);
  const completed = patients.filter((p) => !p.isActive);
  const due = supervisionDuePatientIds(initialTherapySessions, initialSupervisionSessions, active, regeln);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Patient:innen"
        actions={
          <Button variant="link" size="sm" onClick={() => setShowForm(true)}>
            <Plus /> Neu
          </Button>
        }
      />

      {showForm && (
        // Formular: Enter im Feld legt an (#51).
        <Card asChild className="border-primary/40">
          <form noValidate aria-label="Neue:r Patient:in" onSubmit={handleAdd}>
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-foreground">Neue:r Patient:in</h2>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Formular schließen" onClick={() => setShowForm(false)}>
                <X />
              </Button>
            </div>
            <ActionError result={error} />
            <FormField label="Chiffre" htmlFor="new-chiffre">
              <Input
                id="new-chiffre"
                type="text"
                value={newChiffre}
                onChange={(e) => setNewChiffre(e.target.value)}
                placeholder="z. B. M.K."
                autoFocus
                disabled={isSaving}
              />
            </FormField>
            <FormField label="Therapieart" htmlFor="new-type">
              <NativeSelect
                id="new-type"
                value={newType}
                onChange={(e) => setNewType(e.target.value as typeof newType)}
                disabled={isSaving}
                wrapperClassName="w-full"
              >
                <NativeSelectOption value="langzeittherapie">Langzeittherapie</NativeSelectOption>
                <NativeSelectOption value="kurzzeittherapie">Kurzzeittherapie</NativeSelectOption>
              </NativeSelect>
            </FormField>
            <FormField label="Startdatum" htmlFor="new-start">
              <Input id="new-start" type="date" value={newStartDate} onChange={(e) => setNewStartDate(e.target.value)} disabled={isSaving} />
            </FormField>
            <Button type="submit" className="w-full" loading={isSaving}>
              Anlegen
            </Button>
          </form>
        </Card>
      )}

      {active.length > 0 && (
        <section className="space-y-2">
          <SectionHeader>Aktiv ({active.length})</SectionHeader>
          <div className="grid gap-2 md:grid-cols-2">
            {active.map((patient) => {
              const ratio = calculatePatientRatio(patient, initialTherapySessions, initialSupervisionSessions, regeln);
              const hours = therapyHoursForPatient(initialTherapySessions, patient.id);
              return (
                <Card key={patient.id} asChild>
                  <Link href={`/patients/${patient.id}`} className="flex-row items-center justify-between transition-shadow hover:shadow-md">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-foreground">{patient.chiffre}</span>
                        <Badge variant="primary-soft">{patient.therapyType === "kurzzeittherapie" ? "KZT" : "LZT"}</Badge>
                        {due.has(patient.id) && <SupervisionDueBadge />}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Seit {format(parseISO(patient.startDate), "dd.MM.yyyy")} · {formatDecimal(hours, 1)} Behandlungsstunden
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <RatioIndicator ratio={ratio} compact />
                      <ChevronRight size={16} className="text-muted-foreground/60" aria-hidden="true" />
                    </div>
                  </Link>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section className="space-y-2">
          <SectionHeader>Abgeschlossen ({completed.length})</SectionHeader>
          <div className="grid gap-2 md:grid-cols-2">
            {completed.map((patient) => {
              const hours = therapyHoursForPatient(initialTherapySessions, patient.id);
              return (
                <Card key={patient.id} asChild>
                  <Link href={`/patients/${patient.id}`} className="flex-row items-center justify-between transition-shadow hover:shadow-md">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-foreground">{patient.chiffre}</span>
                        <Badge variant="success-soft">Abgeschlossen</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {format(parseISO(patient.startDate), "dd.MM.yyyy")} –{" "}
                        {patient.endDate ? format(parseISO(patient.endDate), "dd.MM.yyyy") : "?"} · {formatDecimal(hours, 1)} Behandlungsstunden
                      </p>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground/60" aria-hidden="true" />
                  </Link>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {patients.length === 0 && !showForm && (
        <div className="py-12 text-center">
          <p className="mb-3 text-muted-foreground">Noch keine Patient:innen angelegt</p>
          <Button onClick={() => setShowForm(true)}>Erste:n Patient:in anlegen</Button>
        </div>
      )}
    </div>
  );
}
