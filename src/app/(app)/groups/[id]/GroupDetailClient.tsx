"use client";

import { useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { de } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";
import { groupSessionCounts, ambulanzzeitRemaining, groupIncomeTotal, getEbmFee, totalSupervisionHours } from "@/lib/calculations";
import { Group, GroupSession, GroupSessionStatus, SupervisionSession, Supervisor } from "@/types";
import type { Regelwerk } from "@/lib/ausbildungsregeln/model";
import ProgressBar from "@/components/ProgressBar";
import { ActionError, errorAt, type ScopedActionError } from "@/components/ActionError";
import { runAction } from "@/lib/run-action";
import { DURATION_MAX_MINUTES, DURATION_MIN_MINUTES, durationError } from "@/components/forms/duration";
import { track, trackFailure } from "@/lib/analytics/track";
import { DEFAULT_SUPERVISION_MINUTES } from "@/lib/constants";
import { FormField, SectionHeader, ConfirmButton, fieldErrorId } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { formatDecimal } from "@/lib/csv";
import { addGroupSession, updateGroupSession, deleteGroupSession, addGroupSupervisionSession } from "./actions";

interface GroupDetailClientProps {
  initialGroup: Group;
  initialGroupSessions: GroupSession[];
  initialSupervisionSessions: SupervisionSession[];
  initialSupervisedGroupSessionIds: string[];
  initialSupervisors: Supervisor[];
  regelwerk: Regelwerk;
}

const STATUS_OPTIONS: { value: GroupSessionStatus; label: string }[] = [
  { value: "geplant", label: "Geplant" },
  { value: "durchgefuehrt", label: "Durchgeführt" },
  { value: "ausgefallen", label: "Ausgefallen" },
  { value: "urlaub", label: "Urlaub" },
];

export function GroupDetailClient({
  initialGroup,
  initialGroupSessions,
  initialSupervisionSessions,
  initialSupervisedGroupSessionIds,
  initialSupervisors,
  regelwerk,
}: GroupDetailClientProps) {
  const [group] = useState(initialGroup);
  const [sessions, setSessions] = useState(initialGroupSessions);
  const [supervisionSessions, setSupervisionSessions] = useState(initialSupervisionSessions);
  const [supervisedIds, setSupervisedIds] = useState(initialSupervisedGroupSessionIds);
  const [showSessionForm, setShowSessionForm] = useState(false);
  const [showSupervisionForm, setShowSupervisionForm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Sperre gegen doppeltes Absenden: greift sofort, noch bevor isSaving neu gerendert ist.
  const savingRef = useRef(false);
  const [error, setError] = useState<ScopedActionError | null>(null);

  // New session form state
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [status, setStatus] = useState<GroupSessionStatus>("durchgefuehrt");
  const [childCount, setChildCount] = useState(group.avgKids ?? 9);
  const [countsTowardAmbulanzzeit, setCountsTowardAmbulanzzeit] = useState(true);

  // New group supervision form state
  const [supervisorId, setSupervisorId] = useState(initialSupervisors[0]?.id || "");
  const [svDate, setSvDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [svDuration, setSvDuration] = useState(String(DEFAULT_SUPERVISION_MINUTES));
  const [svDurationMessage, setSvDurationMessage] = useState<string | undefined>();
  const svDurationRef = useRef<HTMLInputElement>(null);
  const [linkedSessionIds, setLinkedSessionIds] = useState<string[]>([]);

  const counts = groupSessionCounts(sessions);
  const remaining = ambulanzzeitRemaining(sessions, regelwerk.regeln);
  const income = groupIncomeTotal(sessions, regelwerk.ebmStaffeln);
  const feeVorschau = getEbmFee(childCount, date, regelwerk.ebmStaffeln);
  const svHours = totalSupervisionHours(supervisionSessions);
  const unlinkedSessions = sessions.filter((s) => s.status === "durchgefuehrt" && !supervisedIds.includes(s.id));

  async function handleAddSession(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    const result = await runAction(() =>
      addGroupSession({
        groupId: group.id,
        date,
        status,
        childCount: status === "durchgefuehrt" ? childCount : null,
        countsTowardAmbulanzzeit,
        durationMinutes: 100,
        notes: "",
      })
    );
    savingRef.current = false;
    setIsSaving(false);
    if (result.success) {
      setSessions(result.data.groupSessions);
      setShowSessionForm(false);
    } else {
      trackFailure("group_session", "create", result);
      setError({ scope: "session-form", result });
    }
  }

  async function handleAddSupervision(e: React.FormEvent) {
    e.preventDefault();
    if (!supervisorId || savingRef.current) return;
    // Dauer mit eigener Meldung am Feld statt Feldfehler vom Server (#28).
    const invalid = durationError(svDuration);
    setSvDurationMessage(invalid);
    if (invalid) {
      svDurationRef.current?.focus();
      return;
    }
    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    const result = await runAction(() =>
      addGroupSupervisionSession({
        groupId: group.id,
        supervisorId,
        date: svDate,
        durationMinutes: Number(svDuration),
        kind: "group",
        setting: "einzel",
        linkedTherapySessionIds: [],
        linkedGroupSessionIds: linkedSessionIds,
        caseShares: [],
      })
    );
    savingRef.current = false;
    setIsSaving(false);
    if (result.success) {
      track("supervision_saved", { mode: "new", kind: "group" });
      setSupervisionSessions(result.data.supervisionSessions);
      setSupervisedIds(result.data.supervisedGroupSessionIds);
      setLinkedSessionIds([]);
      setShowSupervisionForm(false);
    } else {
      trackFailure("supervision", "create", result);
      setError({ scope: "supervision-form", result });
    }
  }

  async function handleStatusChange(session: GroupSession, newStatus: GroupSessionStatus) {
    setIsSaving(true);
    setError(null);
    const result = await runAction(() =>
      updateGroupSession({
        id: session.id,
        groupId: group.id,
        date: session.date,
        status: newStatus,
        childCount: newStatus === "durchgefuehrt" ? (session.childCount ?? group.avgKids ?? 9) : null,
        countsTowardAmbulanzzeit: session.countsTowardAmbulanzzeit,
        durationMinutes: session.durationMinutes,
        notes: session.notes,
      })
    );
    setIsSaving(false);
    if (result.success) {
      setSessions(result.data.groupSessions);
    } else {
      trackFailure("group_session", "update", result);
      setError({ scope: `session:${session.id}`, result });
    }
  }

  async function handleDeleteSession(session: GroupSession) {
    setIsSaving(true);
    setError(null);
    const result = await runAction(() => deleteGroupSession({ id: session.id, groupId: group.id }));
    setIsSaving(false);
    if (result.success) {
      track("entry_deleted", { entity: "group_session" });
      setSessions(result.data.groupSessions);
      setSupervisionSessions(result.data.supervisionSessions);
      setSupervisedIds(result.data.supervisedGroupSessionIds);
    } else {
      trackFailure("group_session", "delete", result);
      setError({ scope: `session:${session.id}`, result });
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={group.name} backHref="/groups" />

      <Card>
        <ProgressBar current={counts.durchgefuehrt} target={regelwerk.regeln.gruppeDoppelstundenZiel} label="Doppelstunden gesamt" color="blue" />
        <ProgressBar current={counts.ambulanzzeitCount} target={regelwerk.regeln.gruppeAmbulanzzeitZiel} label="davon Ambulanzzeit" color="green" />
        <p className="text-xs text-muted-foreground">Noch {Math.max(remaining, 0)} Doppelstunden Ambulanzzeit übrig</p>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Card className="text-center">
          <p className="text-lg font-bold text-success">{income.toLocaleString("de-DE")}</p>
          <p className="text-[10px] text-muted-foreground">Einnahmen (EUR)</p>
        </Card>
        <Card className="text-center">
          <p className="text-lg font-bold text-foreground">{formatDecimal(svHours, 1)}</p>
          <p className="text-[10px] text-muted-foreground">SV-Einheiten</p>
        </Card>
        <Card className="text-center">
          <p className="text-lg font-bold text-foreground">{counts.ausgefallen}</p>
          <p className="text-[10px] text-muted-foreground">Ausgefallen</p>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <SectionHeader>Doppelstunden ({sessions.length})</SectionHeader>
          <Button variant="ghost" size="sm" onClick={() => {
              setShowSessionForm((v) => !v);
              // Beim Auf- und Zuklappen keine veraltete Meldung des Formulars stehen lassen.
              setError((e) => (e?.scope === "session-form" ? null : e));
            }}>
            <Plus /> Neu
          </Button>
        </div>

        {/* Formular: Enter im Feld speichert (#51). */}
        {showSessionForm && (
          <form noValidate aria-label="Neue Doppelstunde" onSubmit={handleAddSession} className="space-y-3 border-b border-border pb-4">
            <FormField label="Datum" htmlFor="gs-date">
              <Input id="gs-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={isSaving} />
            </FormField>
            <FormField label="Status" htmlFor="gs-status">
              <NativeSelect
                id="gs-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as GroupSessionStatus)}
                disabled={isSaving}
                wrapperClassName="w-full"
              >
                {STATUS_OPTIONS.map((o) => (
                  <NativeSelectOption key={o.value} value={o.value}>
                    {o.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            {status === "durchgefuehrt" && (
              <FormField label="Anwesende Kinder" htmlFor="gs-kids">
                <Input id="gs-kids" type="number" value={childCount} onChange={(e) => setChildCount(Number(e.target.value))} min={0} disabled={isSaving} />
                {feeVorschau && (
                  <p className="text-xs text-muted-foreground">
                    Honorar-Anteil: {feeVorschau.share.toLocaleString("de-DE")} EUR
                  </p>
                )}
              </FormField>
            )}
            <label className="flex items-center gap-2 text-sm text-foreground">
              <Checkbox
                checked={countsTowardAmbulanzzeit}
                onCheckedChange={(checked) => setCountsTowardAmbulanzzeit(checked === true)}
                disabled={isSaving}
              />
              Zählt zur Ambulanzzeit ({regelwerk.regeln.gruppeAmbulanzzeitZiel}h)
            </label>
            <ActionError result={errorAt(error, "session-form")} />
            <Button type="submit" loading={isSaving} className="w-full">
              Speichern
            </Button>
          </form>
        )}

        {sessions.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Noch keine Doppelstunden</p>
        ) : (
          <div className="divide-y divide-border">
            {sessions
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((session) => {
                const isSupervised = supervisedIds.includes(session.id);
                return (
                  <div key={session.id} className="flex flex-wrap items-center gap-x-2 gap-y-2 py-2">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm text-foreground">{format(parseISO(session.date), "dd. MMM yyyy", { locale: de })}</span>
                      {session.childCount !== null && (
                        <span className="ml-2 text-xs text-muted-foreground">{session.childCount} Kinder</span>
                      )}
                    </div>
                    <NativeSelect
                      size="sm"
                      value={session.status}
                      onChange={(e) => handleStatusChange(session, e.target.value as GroupSessionStatus)}
                      disabled={isSaving}
                      aria-label="Status"
                    >
                      {STATUS_OPTIONS.map((o) => (
                        <NativeSelectOption key={o.value} value={o.value}>
                          {o.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                    <ConfirmButton
                      ariaLabel="Doppelstunde löschen"
                      label={<Trash2 size={16} />}
                      question={`Doppelstunde vom ${format(parseISO(session.date), "dd.MM.yyyy")} wirklich löschen?`}
                      description={
                        isSupervised
                          ? "Die Zuordnung zur Gruppen-Supervision wird entfernt, die Supervision selbst bleibt bestehen."
                          : undefined
                      }
                      onConfirm={() => handleDeleteSession(session)}
                      loading={isSaving}
                      className="size-8 text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                    />
                    <ActionError result={errorAt(error, `session:${session.id}`)} />
                  </div>
                );
              })}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <SectionHeader>Gruppen-Supervision ({supervisionSessions.length})</SectionHeader>
          <Button variant="ghost" size="sm" onClick={() => {
              setShowSupervisionForm((v) => !v);
              setError((e) => (e?.scope === "supervision-form" ? null : e));
              setSvDurationMessage(undefined);
            }}>
            <Plus /> Neu
          </Button>
        </div>

        {showSupervisionForm && (
          <form
            noValidate
            aria-label="Neue Gruppen-Supervision"
            onSubmit={handleAddSupervision}
            className="space-y-3 border-b border-border pb-4"
          >
            <FormField label="Supervisor:in" htmlFor="gsv-supervisor">
              <NativeSelect
                id="gsv-supervisor"
                value={supervisorId}
                onChange={(e) => setSupervisorId(e.target.value)}
                disabled={isSaving}
                wrapperClassName="w-full"
              >
                {initialSupervisors.map((s) => (
                  <NativeSelectOption key={s.id} value={s.id}>
                    {s.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </FormField>
            <FormField label="Datum" htmlFor="gsv-date">
              <Input id="gsv-date" type="date" value={svDate} onChange={(e) => setSvDate(e.target.value)} disabled={isSaving} />
            </FormField>
            <FormField label="Dauer (Min)" htmlFor="gsv-duration" error={svDurationMessage}>
              <Input
                ref={svDurationRef}
                id="gsv-duration"
                type="number"
                inputMode="numeric"
                value={svDuration}
                onChange={(e) => {
                  setSvDuration(e.target.value);
                  setSvDurationMessage(undefined);
                }}
                min={DURATION_MIN_MINUTES}
                max={DURATION_MAX_MINUTES}
                aria-invalid={svDurationMessage ? true : undefined}
                aria-describedby={svDurationMessage ? fieldErrorId("gsv-duration") : undefined}
                disabled={isSaving}
              />
            </FormField>
            {unlinkedSessions.length > 0 && (
              <fieldset className="min-w-0">
                <legend className="mb-2 text-sm leading-none font-medium">Besprochene Doppelstunden</legend>
                <div className="max-h-40 space-y-1.5 overflow-y-auto">
                  {unlinkedSessions.map((s) => {
                    const isChecked = linkedSessionIds.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg border p-2 transition-colors",
                          isChecked ? "border-primary/40 bg-primary-soft" : "border-border hover:border-input"
                        )}
                      >
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() =>
                            setLinkedSessionIds((prev) => (isChecked ? prev.filter((id) => id !== s.id) : [...prev, s.id]))
                          }
                          disabled={isSaving}
                        />
                        <span className="text-sm text-foreground">{format(parseISO(s.date), "dd.MM.yyyy")}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
            <ActionError result={errorAt(error, "supervision-form")} />
            <Button type="submit" loading={isSaving} className="w-full" disabled={!supervisorId}>
              Speichern
            </Button>
          </form>
        )}

        {supervisionSessions.length === 0 ? (
          <p className="py-3 text-center text-sm text-muted-foreground">Noch keine Gruppen-Supervision</p>
        ) : (
          <div className="divide-y divide-border">
            {supervisionSessions
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((sv) => {
                const supervisor = initialSupervisors.find((s) => s.id === sv.supervisorId);
                return (
                  <div key={sv.id} className="flex items-center justify-between py-2">
                    <div>
                      <span className="text-sm text-foreground">{format(parseISO(sv.date), "dd. MMM yyyy", { locale: de })}</span>
                      <span className="ml-2 text-xs text-muted-foreground">{supervisor?.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{sv.durationMinutes} Min</span>
                  </div>
                );
              })}
          </div>
        )}
      </Card>
    </div>
  );
}
