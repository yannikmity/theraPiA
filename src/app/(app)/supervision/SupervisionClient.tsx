"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { SupervisionSession } from "@/types";
import { linkableTherapySessions, linkableGroupSessions, totalSupervisionHours } from "@/lib/calculations";
import { formatDecimal } from "@/lib/csv";
import { CATEGORY_LABELS, SUPERVISION_KIND_LABELS, SUPERVISION_SETTING_LABELS } from "@/lib/labels";
import { ActionError, errorAt, type ScopedActionError } from "@/components/ActionError";
import { runAction } from "@/lib/run-action";
import { track, trackFailure } from "@/lib/analytics/track";
import { ConfirmButton, SectionHeader } from "@/components/ui";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { updateSupervisionSessionAction, deleteSupervisionSessionAction, type SupervisionData } from "./actions";
import { SupervisionSessionEditForm, type LinkOption, type SupervisionFormValues } from "./SupervisionSessionEditForm";

interface SupervisionClientProps {
  initialData: SupervisionData;
  // Von der Patient:innen-Seite: diese Supervision gleich im Bearbeiten-Formular öffnen …
  initialEditingId?: string;
  // … und nach dem Speichern bzw. mit „Zurück“ wieder dorthin.
  returnHref?: string;
}

// Nachfrage beim Löschen: „1 Zuordnung(en)“ → sauberer Singular/Plural (#28).
function zuordnungenEntfernt(n: number): string {
  return n === 1
    ? "Die Zuordnung wird entfernt, die Sitzung selbst bleibt bestehen."
    : `${n} Zuordnungen werden entfernt, die Sitzungen selbst bleiben bestehen.`;
}

export function SupervisionClient({ initialData, initialEditingId, returnHref }: SupervisionClientProps) {
  const [data, setData] = useState(initialData);
  const [editingId, setEditingId] = useState<string | null>(initialEditingId ?? null);
  const router = useRouter();

  // Direkt geöffnetes Formular ins Bild holen: in einer langen Liste stünde es sonst weit unten.
  useEffect(() => {
    if (initialEditingId) document.getElementById(`sv-${initialEditingId}`)?.scrollIntoView?.({ block: "start" });
  }, [initialEditingId]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<ScopedActionError | null>(null);

  const sessions = [...data.supervisionSessions].sort((a, b) => b.date.localeCompare(a.date));
  // Getrennt wie auf dem Dashboard: Supervision der Einzeltherapie und der Gruppenfachkunde.
  const totalHours = totalSupervisionHours(data.supervisionSessions.filter((s) => s.kind === "individual"));
  const groupHours = totalSupervisionHours(data.supervisionSessions.filter((s) => s.kind === "group"));

  function supervisorName(id: string): string {
    return data.supervisors.find((s) => s.id === id)?.name ?? "Unbekannt";
  }

  function linkCount(sv: SupervisionSession): number {
    return sv.kind === "group" ? sv.linkedGroupSessionIds.length : sv.linkedTherapySessionIds.length;
  }

  function caseLabel(patientId: string): string {
    return data.patients.find((p) => p.id === patientId)?.chiffre ?? "?";
  }

  // Angeboten werden Sitzungen, die keiner anderen Supervision zugeordnet sind – plus die eigenen. Therapiesitzungen
  // nur bis zum Datum, das gerade im Formular steht.
  function linkOptionsFor(sv: SupervisionSession, date: string): LinkOption[] {
    if (sv.kind === "group") {
      return linkableGroupSessions(data.groupSessions, data.supervisionSessions, sv.id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((gs) => ({
          id: gs.id,
          label: `${data.groups.find((g) => g.id === gs.groupId)?.name ?? "Gruppe"} · ${format(parseISO(gs.date), "dd.MM.yyyy")}${gs.status === "durchgefuehrt" ? "" : " (nicht durchgeführt)"}`,
        }));
    }
    return linkableTherapySessions(data.therapySessions, data.supervisionSessions, sv.id, date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((ts) => ({
        id: ts.id,
        // Kategorie und Dauer der Therapiesitzung, damit sie nicht wie Supervisionszeit aussieht (Pilot-Feedback 2026-11-15).
        label: `${caseLabel(ts.patientId)} · ${format(parseISO(ts.date), "dd.MM.yyyy")} · ${CATEGORY_LABELS[ts.category]} (${ts.durationMinutes} Min)`,
        patientId: ts.patientId,
      }));
  }

  async function handleSave(sv: SupervisionSession, values: SupervisionFormValues) {
    setIsSaving(true);
    setError(null);
    const result = await runAction(() =>
      updateSupervisionSessionAction({
        id: sv.id,
        supervisorId: values.supervisorId,
        date: values.date,
        durationMinutes: values.durationMinutes,
        kind: sv.kind,
        setting: values.setting,
        gruppengroesse: values.gruppengroesse,
        kostenlos: values.kostenlos,
        linkedTherapySessionIds: sv.kind === "group" ? [] : values.linkedIds,
        linkedGroupSessionIds: sv.kind === "group" ? values.linkedIds : [],
        caseShares: sv.kind === "group" ? [] : values.caseShares,
      })
    );
    setIsSaving(false);
    if (result.success) {
      track("supervision_saved", { mode: "edit", kind: sv.kind });
      setData(result.data);
      setEditingId(null);
      if (returnHref) router.push(returnHref);
    } else {
      trackFailure("supervision", "update", result);
      setError({ scope: `sv:${sv.id}`, result });
    }
  }

  async function handleDelete(sv: SupervisionSession) {
    setIsSaving(true);
    setError(null);
    const result = await runAction(() => deleteSupervisionSessionAction({ id: sv.id }));
    setIsSaving(false);
    if (result.success) {
      track("entry_deleted", { entity: "supervision" });
      setData(result.data);
    } else {
      trackFailure("supervision", "delete", result);
      setError({ scope: `sv:${sv.id}`, result });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Supervisionen"
        backHref={returnHref ?? "/profile"}
        subtitle={
          // Mit dem Knopf daneben wird der Kopf am Handy schmal – die Einheiten nicht am Bindestrich umbrechen.
          <>
            {sessions.length} Supervisionen ·{" "}
            <span className="whitespace-nowrap">{formatDecimal(totalHours, 1)} SV-Einheiten</span>
            {groupHours > 0 && (
              <>
                {" "}
                · <span className="whitespace-nowrap">{formatDecimal(groupHours, 1)} Gruppenfachkunde</span>
              </>
            )}
          </>
        }
        actions={
          // Wie „+ Sitzung“ auf der Patient:innen-Seite: Sprung in das gemeinsame Erfassen-Formular, Supervision vorgewählt.
          <Link
            href="/sessions/new?type=supervision"
            aria-label="Supervision erfassen"
            className={buttonVariants({ variant: "success" })}
          >
            <Plus aria-hidden="true" />
            Supervision
          </Link>
        }
      />

      <Card>
        <SectionHeader>Alle Supervisionen</SectionHeader>
        {sessions.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Noch keine Supervisionen erfasst</p>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map((sv) =>
              editingId === sv.id ? (
                <div key={sv.id} id={`sv-${sv.id}`} className="scroll-mt-20">
                  <SupervisionSessionEditForm
                    session={sv}
                    supervisors={data.supervisors}
                    linkOptionsFor={(date) => linkOptionsFor(sv, date)}
                    caseLabel={caseLabel}
                    saving={isSaving}
                    onSave={(values) => handleSave(sv, values)}
                    onCancel={() => {
                      setEditingId(null);
                      // Direkteinstieg: Parameter aus der Adresse nehmen, sonst öffnet ein Neuladen das Formular erneut.
                      if (sv.id === initialEditingId) router.replace(returnHref ? `/supervision?patient=${returnHref.split("/").pop()}` : "/supervision");
                      setError(null);
                    }}
                  />
                  <ActionError result={errorAt(error, `sv:${sv.id}`)} />
                </div>
              ) : (
                <div key={sv.id} className="flex flex-wrap items-center gap-x-2 gap-y-2 py-2">
                  <BookOpen size={14} className="shrink-0 text-success" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm text-foreground">{format(parseISO(sv.date), "dd. MMM yyyy", { locale: de })}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{supervisorName(sv.supervisorId)}</span>
                    <p className="text-xs text-muted-foreground">
                      {SUPERVISION_KIND_LABELS[sv.kind]} · {SUPERVISION_SETTING_LABELS[sv.setting]} · {linkCount(sv)} zugeordnet
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{sv.durationMinutes} Min</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      setEditingId(sv.id);
                      setError(null);
                    }}
                    disabled={isSaving}
                    aria-label="Supervision bearbeiten"
                  >
                    <Pencil />
                  </Button>
                  <ConfirmButton
                    ariaLabel="Supervision löschen"
                    label={<Trash2 size={16} />}
                    question={`Supervision vom ${format(parseISO(sv.date), "dd.MM.yyyy")} wirklich löschen?`}
                    description={linkCount(sv) > 0 ? zuordnungenEntfernt(linkCount(sv)) : undefined}
                    onConfirm={() => handleDelete(sv)}
                    loading={isSaving}
                    className="size-8 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                  />
                  <ActionError result={errorAt(error, `sv:${sv.id}`)} />
                </div>
              )
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
