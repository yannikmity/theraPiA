"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { BookOpen, Pencil, Trash2 } from "lucide-react";
import { SupervisionSession } from "@/types";
import { linkableTherapySessions, linkableGroupSessions, totalSupervisionHours } from "@/lib/calculations";
import { formatDecimal } from "@/lib/csv";
import { SUPERVISION_KIND_LABELS, SUPERVISION_SETTING_LABELS } from "@/lib/labels";
import { ActionError, errorAt, type ScopedActionError } from "@/components/ActionError";
import { runAction } from "@/lib/run-action";
import { track, trackFailure } from "@/lib/analytics/track";
import { ConfirmButton, SectionHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/PageHeader";
import { updateSupervisionSessionAction, deleteSupervisionSessionAction, type SupervisionData } from "./actions";
import { SupervisionSessionEditForm, type LinkOption, type SupervisionFormValues } from "./SupervisionSessionEditForm";

interface SupervisionClientProps {
  initialData: SupervisionData;
}

// Nachfrage beim Löschen: „1 Zuordnung(en)“ → sauberer Singular/Plural (#28).
function zuordnungenEntfernt(n: number): string {
  return n === 1
    ? "Die Zuordnung wird entfernt, die Sitzung selbst bleibt bestehen."
    : `${n} Zuordnungen werden entfernt, die Sitzungen selbst bleiben bestehen.`;
}

export function SupervisionClient({ initialData }: SupervisionClientProps) {
  const [data, setData] = useState(initialData);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<ScopedActionError | null>(null);

  const sessions = [...data.supervisionSessions].sort((a, b) => b.date.localeCompare(a.date));
  const totalHours = totalSupervisionHours(data.supervisionSessions);

  function supervisorName(id: string): string {
    return data.supervisors.find((s) => s.id === id)?.name ?? "Unbekannt";
  }

  function linkCount(sv: SupervisionSession): number {
    return sv.kind === "group" ? sv.linkedGroupSessionIds.length : sv.linkedTherapySessionIds.length;
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
        label: `${data.patients.find((p) => p.id === ts.patientId)?.chiffre ?? "?"} · ${format(parseISO(ts.date), "dd.MM.yyyy")} · ${ts.durationMinutes} Min`,
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
        linkedTherapySessionIds: sv.kind === "group" ? [] : values.linkedIds,
        linkedGroupSessionIds: sv.kind === "group" ? values.linkedIds : [],
      })
    );
    setIsSaving(false);
    if (result.success) {
      track("supervision_saved", { mode: "edit", kind: sv.kind });
      setData(result.data);
      setEditingId(null);
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
        backHref="/profile"
        subtitle={`${sessions.length} Supervisionen · ${formatDecimal(totalHours, 1)} SV-Einheiten`}
      />

      <Card>
        <SectionHeader>Alle Supervisionen</SectionHeader>
        {sessions.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Noch keine Supervisionen erfasst</p>
        ) : (
          <div className="divide-y divide-border">
            {sessions.map((sv) =>
              editingId === sv.id ? (
                <div key={sv.id}>
                  <SupervisionSessionEditForm
                    session={sv}
                    supervisors={data.supervisors}
                    linkOptionsFor={(date) => linkOptionsFor(sv, date)}
                    saving={isSaving}
                    onSave={(values) => handleSave(sv, values)}
                    onCancel={() => {
                      setEditingId(null);
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
