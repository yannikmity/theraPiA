"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, LayoutDashboard, PlusCircle, Repeat, StickyNote } from "lucide-react";
import { Patient, Supervisor, TherapySession, SessionCategory, SupervisionSetting } from "@/types";
import { ActionError, errorAt, type ScopedActionError } from "@/components/ActionError";
import { track, trackFailure } from "@/lib/analytics/track";
import { runAction } from "@/lib/run-action";
import { countNoun } from "@/lib/format";
import { supervisionCases } from "@/lib/calculations";
import type { Ausbildungsregeln } from "@/lib/ausbildungsregeln/model";
import { DURATION_MAX_MINUTES, DURATION_MIN_MINUTES, durationError } from "@/components/forms/duration";
import {
  DEFAULT_SUPERVISION_MINUTES,
  DEFAULT_THERAPY_SESSION_MINUTES,
  durationPresetsFor,
} from "@/lib/constants";
import { formatWeekdayDateDe } from "@/lib/dates";
import { CATEGORY_LABELS, CATEGORY_ORDER, SUPERVISION_SETTING_LABELS, SUPERVISION_SETTING_ORDER } from "@/lib/labels";
import type { CaptureType, LastWeekSuggestion } from "@/lib/quick-capture";
import { FormField, SectionHeader, fieldErrorId } from "@/components/ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { SupervisionDueBadge } from "@/components/SupervisionDueBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/layout/PageHeader";
import { cn } from "@/lib/utils";
import { addTherapySession, addTherapySessions, addSupervisionSession, type BatchSaveResult } from "./actions";

interface NewSessionClientProps {
  /** Aktive Patient:innen – Auswahl für Therapiesitzungen. */
  initialPatients: Patient[];
  /** Alle Patient:innen, auch abgeschlossene – eine Abschluss-Supervision bespricht offene Sitzungen nach Therapieende. */
  supervisionPatients: Patient[];
  initialSupervisors: Supervisor[];
  initialUnsupervisedSessions: TherapySession[];
  /** Heutiges Datum (YYYY-MM-DD) vom Server – Vorgabe für das Datumsfeld, gleich auf Server und Client. */
  today: string;
  initialType: CaptureType;
  /** Vorbelegte Patient:in (Adresse, sonst zuletzt genutzt); "" ohne aktive Patient:innen. */
  initialPatientId: string;
  /** Letzte Kategorie je Patient:in – die Vorbelegung folgt der letzten Sitzung. */
  categoryByPatient: Record<string, SessionCategory>;
  /** „Wie letzte Woche“: Sitzungen der Vorwoche, um sieben Tage verschoben (siehe quick-capture.ts). */
  suggestions: LastWeekSuggestion[];
  /** Regelwerk der Instanz – Soll-Verhältnis für die Markierung „SV fällig“. */
  regeln: Ausbildungsregeln;
  /** Setting der letzten Supervision je Supervisor:in – Vorgabe für Einzel/Gruppe. */
  settingBySupervisor: Record<string, SupervisionSetting>;
}

const CATEGORY_OPTIONS = CATEGORY_ORDER.map((value) => ({ value, label: CATEGORY_LABELS[value] }));

const DEFAULT_CATEGORY: SessionCategory = "behandlung";
const sitzungen = (n: number) => countNoun(n, "Sitzung", "Sitzungen");

// Klassen für Auswahl-Chips (Radix ToggleGroup): Therapie blau, Supervision grün.
// h-11 am Handy (Touch-Ziel ≥ 44 px), md:h-10 wie die übrigen Formularfelder.
const CHIP = "h-11 flex-1 rounded-lg text-sm font-medium data-[state=on]:shadow-xs md:h-10";
const CHIP_PRIMARY = "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground";
const CHIP_SUCCESS = "data-[state=on]:bg-success data-[state=on]:text-success-foreground";
const CHIP_OUTLINE =
  "h-11 flex-1 rounded-lg border border-input text-sm font-medium text-muted-foreground data-[state=on]:border-primary data-[state=on]:bg-primary-soft data-[state=on]:text-primary md:h-10";

export function NewSessionClient({
  initialPatients,
  supervisionPatients,
  initialSupervisors,
  initialUnsupervisedSessions,
  today,
  initialType,
  initialPatientId,
  categoryByPatient,
  suggestions,
  regeln,
  settingBySupervisor,
}: NewSessionClientProps) {
  const router = useRouter();
  const [type, setType] = useState<CaptureType>(initialType);
  const [date, setDate] = useState(today);
  const [duration, setDuration] = useState(
    initialType === "therapie" ? DEFAULT_THERAPY_SESSION_MINUTES : DEFAULT_SUPERVISION_MINUTES
  );
  const [customDuration, setCustomDuration] = useState(false);
  // Freie Dauer („Andere“) als Text: ein geleertes Feld bleibt leer und meldet „Bitte eine Dauer angeben“ – als Zahl
  // gespeichert stünde dort „0“ mit „mindestens 1 Minute“ (#56). `duration` bleibt die gewählte Vorgabe.
  const [customText, setCustomText] = useState("");
  const [patientId, setPatientId] = useState(initialPatientId);
  const [supervisorId, setSupervisorId] = useState(initialSupervisors[0]?.id || "");
  // Besprochene Fälle: null = Vorauswahl (alle als „SV fällig“ markierten Fälle zum Datum), sonst die eigene Auswahl.
  const [chosenPatientIds, setChosenPatientIds] = useState<string[] | null>(null);
  const [setting, setSetting] = useState<SupervisionSetting>(
    settingBySupervisor[initialSupervisors[0]?.id ?? ""] ?? "einzel"
  );
  const [category, setCategory] = useState<SessionCategory>(categoryByPatient[initialPatientId] ?? DEFAULT_CATEGORY);
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<ScopedActionError | null>(null);
  const [durationMessage, setDurationMessage] = useState<string | undefined>();
  // Supervision: Die Summe über alle gewählten Fälle darf das Maximum nicht überschreiten – der Server lehnt sie sonst ab.
  const [totalMessage, setTotalMessage] = useState<string | undefined>();
  // „Wie letzte Woche“: null = zugeklappt, sonst die gewählten Vorschläge (Schlüssel: Quell-Sitzung).
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [batchResult, setBatchResult] = useState<BatchSaveResult | null>(null);
  // Sperre gegen Doppeltipp: greift sofort, noch bevor der gesperrte Knopf neu gerendert ist.
  const savingRef = useRef(false);
  const durationRef = useRef<HTMLInputElement>(null);

  const showSuggestions = type === "therapie" && suggestions.length > 0 && batchResult === null;
  const presets = durationPresetsFor(type === "therapie" ? category : null);
  // Sechs Dauer-Chips (Gesprächsziffer) passen auf dem Handy nicht in eine Zeile: dort drei pro Zeile, ab sm eine Zeile.
  const durationChipWidth = presets.length > 4 ? "flex-[1_1_calc(33.333%-0.5rem)] sm:flex-1" : undefined;

  // Fälle mit offenen Sitzungen bis zum Datum der Supervision – spätere können nicht besprochen worden sein.
  // Laufende Fälle zuerst: Abgeschlossene tragen oft viele alte offene Sitzungen und stünden sonst über den
  // vorausgewählten laufenden. Stabile Sortierung, innerhalb der Gruppen bleibt die Reihenfolge erhalten.
  const cases = useMemo(
    () =>
      [...supervisionCases(initialUnsupervisedSessions, supervisionPatients, date, regeln)].sort(
        (a, b) => Number(b.patient.isActive) - Number(a.patient.isActive)
      ),
    [initialUnsupervisedSessions, supervisionPatients, date, regeln]
  );
  // „SV fällig“ und Vorauswahl nur für laufende Fälle: Abgeschlossene tragen oft viele alte, nie zugeordnete
  // Sitzungen und wären sonst bei jeder Supervision vorausgewählt. Sie bleiben wählbar (Abschluss-Supervision).
  const isDue = (c: (typeof cases)[number]) => c.due && c.patient.isActive;
  const selectedPatientIds = chosenPatientIds ?? cases.filter(isDue).map((c) => c.patient.id);
  const selectedCases = cases.filter((c) => selectedPatientIds.includes(c.patient.id));
  // Dauer je Fall für die Gesamt-Zeile; bei ungültiger freier Dauer keine Zeile.
  const perCaseMinutes = customDuration ? (durationError(customText) ? undefined : Number(customText)) : duration;

  function toggleCase(id: string) {
    setTotalMessage(undefined);
    setChosenPatientIds(
      selectedPatientIds.includes(id) ? selectedPatientIds.filter((x) => x !== id) : [...selectedPatientIds, id]
    );
  }

  function chooseSupervisor(id: string) {
    setSupervisorId(id);
    setSetting(settingBySupervisor[id] ?? "einzel");
  }

  // Wechsel in die Gesprächsziffer beginnt bei deren Vorgabe (10 Min) – 50 Min lägen zwar im Raster, sind dort aber
  // die Ausnahme. Zurück springt eine Dauer außerhalb des 25er-Rasters auf 50 Min. Eine freie Dauer bleibt stehen.
  function changeCategory(next: SessionCategory) {
    setCategory(next);
    if (customDuration) return;
    const nextPresets = durationPresetsFor(next);
    if (next === "gespraechsziffer" && category !== "gespraechsziffer") setDuration(nextPresets[0]);
    else if (!nextPresets.includes(duration)) setDuration(DEFAULT_THERAPY_SESSION_MINUTES);
  }

  function choosePatient(id: string) {
    setPatientId(id);
    changeCategory(categoryByPatient[id] ?? DEFAULT_CATEGORY);
  }

  async function handleSave() {
    if (savingRef.current) return;
    // Freie Dauer („Andere“): eigene Meldung am Feld statt Browser-Tooltip oder Feldfehler vom Server (#28).
    const invalid = customDuration ? durationError(customText) : undefined;
    setDurationMessage(invalid);
    if (invalid) {
      durationRef.current?.focus();
      return;
    }
    const minutes = customDuration ? Number(customText) : duration;
    // Die Dauer gilt je besprochenem Fall; gespeichert wird die Summe (ohne Fall: die Dauer einmal).
    const supervisionTotal = minutes * Math.max(1, selectedCases.length);
    const tooLong = type === "supervision" && supervisionTotal > DURATION_MAX_MINUTES;
    setTotalMessage(
      tooLong
        ? `Gesamtdauer ${supervisionTotal} Min überschreitet das Maximum von ${DURATION_MAX_MINUTES} Min – weniger Patient:innen wählen oder die Dauer je Patient:in verringern.`
        : undefined
    );
    if (tooLong) return;
    savingRef.current = true;
    setIsSaving(true);
    setError(null);
    const result = await runAction<void>(() =>
      type === "therapie"
        ? addTherapySession({ patientId, date, durationMinutes: minutes, notes, category })
        : addSupervisionSession({
            supervisorId,
            date,
            durationMinutes: supervisionTotal,
            kind: "individual",
            setting,
            linkedTherapySessionIds: selectedCases.flatMap((c) => c.sessionIds),
            linkedGroupSessionIds: [],
          })
    );
    savingRef.current = false;
    setIsSaving(false);
    if (result.success) {
      // Getrennte Aufrufe, damit der Compiler die Daten je Event prüft.
      if (type === "therapie") track("therapy_session_saved", { mode: "new" });
      else track("supervision_saved", { mode: "new", kind: "individual" });
      setSaved(true);
    } else {
      trackFailure(type === "therapie" ? "therapy_session" : "supervision", "create", result);
      setError({ scope: "save", result });
    }
  }

  // Nächste Stunde: Patient:in, Datum, Dauer und Kategorie bleiben – Vorschläge und offene Sitzungen kommen
  // per refresh() neu vom Server. Auswahl und Stapel-Meldung gehören zu den alten Vorschlägen und fallen weg.
  function handleAnother() {
    setSaved(false);
    setNotes("");
    setShowNotes(false);
    setChosenPatientIds(null);
    setError(null);
    setDurationMessage(undefined);
    setTotalMessage(undefined);
    setSelected(null);
    setBatchResult(null);
    router.refresh();
  }

  // Auf- und Zuklappen verwirft eine Stapel-Meldung – sie gehört zur vorigen Auswahl und erschiene sonst beim nächsten
  // Aufklappen wieder (#56). Eine Meldung am Speichern-Knopf (scope "save") bleibt stehen.
  const dropBatchError = () => setError((e) => (e?.scope === "batch" ? null : e));
  function openSuggestions() {
    setSelected(new Set(suggestions.map((s) => s.sourceSessionId)));
    dropBatchError();
  }
  function closeSuggestions() {
    setSelected(null);
    dropBatchError();
  }

  function toggleSuggestion(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function handleApplySuggestions() {
    if (!selected || selected.size === 0 || savingRef.current) return;
    savingRef.current = true;
    const chosen = suggestions.filter((s) => selected.has(s.sourceSessionId));
    setIsSaving(true);
    setError(null);
    const result = await runAction(() =>
      addTherapySessions({
        sessions: chosen.map((s) => ({
          patientId: s.patientId,
          date: s.date,
          durationMinutes: s.durationMinutes,
          notes: "",
          category: s.category,
        })),
      })
    );
    savingRef.current = false;
    setIsSaving(false);
    if (result.success) {
      track("last_week_suggestions_applied", { count: result.data.saved });
      setBatchResult(result.data);
      setSelected(null);
      router.refresh();
    } else {
      trackFailure("therapy_session", "create", result);
      setError({ scope: "batch", result });
    }
  }

  if (saved) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-10">
        <div className="flex size-16 items-center justify-center rounded-full bg-success-soft">
          <Check size={32} className="text-success" aria-hidden="true" />
        </div>
        <p className="text-lg font-medium text-success" role="status">
          Gespeichert!
        </p>
        <Button variant="success" size="lg" onClick={handleAnother} className="w-full">
          <PlusCircle />
          Weitere Stunde erfassen
        </Button>
        <Button asChild variant="outline" size="lg" className="w-full">
          <Link href="/">
            <LayoutDashboard />
            Zum Dashboard
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader title="Stunde erfassen" backHref="/" backLabel="Zum Dashboard" />

      {batchResult && (
        <Alert variant="success">
          <AlertDescription>
            {sitzungen(batchResult.saved)} gespeichert
            {batchResult.skipped > 0 ? `, ${batchResult.skipped} übersprungen (gab es schon)` : ""}.
          </AlertDescription>
        </Alert>
      )}

      <ToggleGroup
        type="single"
        value={type}
        onValueChange={(value) => {
          if (!value) return; // Radix erlaubt Abwählen – es bleibt immer eine Art gewählt
          setType(value as CaptureType);
          setDuration(value === "therapie" ? DEFAULT_THERAPY_SESSION_MINUTES : DEFAULT_SUPERVISION_MINUTES);
          setCustomDuration(false);
          setDurationMessage(undefined);
          setTotalMessage(undefined);
        }}
        disabled={isSaving}
        spacing={1}
        aria-label="Art der Stunde"
        className="w-full rounded-xl bg-muted p-1"
      >
        <ToggleGroupItem value="therapie" className={cn(CHIP, CHIP_PRIMARY)}>
          Therapie
        </ToggleGroupItem>
        <ToggleGroupItem value="supervision" className={cn(CHIP, CHIP_SUCCESS)}>
          Supervision
        </ToggleGroupItem>
      </ToggleGroup>

      {showSuggestions && (
        <Card role="region" aria-label="Wie letzte Woche">
          {selected === null ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={openSuggestions}
              disabled={isSaving}
              className="h-auto min-h-11 w-full justify-start py-2 text-left whitespace-normal"
            >
              <Repeat />
              Wie letzte Woche: {sitzungen(suggestions.length)} übernehmen
            </Button>
          ) : (
            <>
              <SectionHeader>Wie letzte Woche</SectionHeader>
              <p className="text-xs text-muted-foreground">
                Sitzungen der Vorwoche, um sieben Tage verschoben. Abwählen, was nicht stattgefunden hat – gespeichert
                wird erst mit dem Knopf.
              </p>
              <div role="group" aria-label="Vorschläge aus der Vorwoche" className="space-y-1.5">
                {suggestions.map((s) => {
                  const isChecked = selected.has(s.sourceSessionId);
                  return (
                    <label
                      key={s.sourceSessionId}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors",
                        isChecked ? "border-primary/40 bg-primary-soft" : "border-border hover:border-input"
                      )}
                    >
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleSuggestion(s.sourceSessionId)}
                        disabled={isSaving}
                      />
                      <span className="flex-1 text-sm text-foreground">
                        <span className="font-medium">{formatWeekdayDateDe(s.date)}</span>
                        <span className="ml-2 font-mono">{s.chiffre}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {CATEGORY_LABELS[s.category]} · {s.durationMinutes} Min
                      </span>
                    </label>
                  );
                })}
              </div>
              <ActionError result={errorAt(error, "batch")} />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="success"
                  onClick={handleApplySuggestions}
                  loading={isSaving}
                  disabled={selected.size === 0}
                  className="flex-1"
                >
                  <Check />
                  {sitzungen(selected.size)} speichern
                </Button>
                <Button type="button" variant="outline" onClick={closeSuggestions} disabled={isSaving} className="flex-1">
                  Abbrechen
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      <FormField label="Datum" htmlFor="session-date">
        <Input
          id="session-date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setTotalMessage(undefined); // anderes Datum, andere Vorauswahl der Fälle
          }}
          disabled={isSaving}
        />
      </FormField>

      {type === "therapie" ? (
        <FormField label="Patient:in (Chiffre)" htmlFor="session-patient">
          <NativeSelect
            id="session-patient"
            value={patientId}
            onChange={(e) => choosePatient(e.target.value)}
            disabled={isSaving}
            wrapperClassName="w-full"
          >
            {initialPatients.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.chiffre}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {initialPatients.length === 0 && (
            <p className="text-xs text-warning">
              Bitte zuerst eine:n{" "}
              <Link href="/patients" className="font-medium underline">
                Patient:in anlegen
              </Link>
              .
            </p>
          )}
        </FormField>
      ) : (
        <FormField label="Supervisor:in" htmlFor="session-supervisor">
          <NativeSelect
            id="session-supervisor"
            value={supervisorId}
            onChange={(e) => chooseSupervisor(e.target.value)}
            disabled={isSaving}
            wrapperClassName="w-full"
          >
            {initialSupervisors.map((s) => (
              <NativeSelectOption key={s.id} value={s.id}>
                {s.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {initialSupervisors.length === 0 ? (
            <p className="text-xs text-warning">
              Bitte zuerst eine:n{" "}
              <Link href="/supervisors" className="font-medium underline">
                Supervisor:in anlegen
              </Link>
              .
            </p>
          ) : (
            <Link href="/supervisors" className="inline-block text-xs text-primary hover:underline">
              Supervisor:innen verwalten
            </Link>
          )}
        </FormField>
      )}

      {type === "supervision" && (
        <div className="space-y-2">
          <Label>Setting</Label>
          <ToggleGroup
            type="single"
            value={setting}
            onValueChange={(value) => value && setSetting(value as SupervisionSetting)}
            disabled={isSaving}
            spacing={2}
            aria-label="Setting"
            className="w-full"
          >
            {SUPERVISION_SETTING_ORDER.map((s) => (
              <ToggleGroupItem key={s} value={s} className={CHIP_OUTLINE}>
                {SUPERVISION_SETTING_LABELS[s]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      <div className="space-y-2">
        <Label>{type === "supervision" ? "Dauer je Patient:in" : "Dauer"}</Label>
        <ToggleGroup
          type="single"
          value={customDuration ? "andere" : String(duration)}
          onValueChange={(value) => {
            if (!value) return;
            setDurationMessage(undefined);
            setTotalMessage(undefined);
            if (value === "andere") {
              setCustomText(String(duration));
              setCustomDuration(true);
            } else {
              setDuration(Number(value));
              setCustomDuration(false);
            }
          }}
          disabled={isSaving}
          spacing={2}
          aria-label="Dauer"
          className="w-full flex-wrap"
        >
          {presets.map((d) => (
            <ToggleGroupItem key={d} value={String(d)} className={cn(CHIP_OUTLINE, durationChipWidth)}>
              {d} Min
            </ToggleGroupItem>
          ))}
          <ToggleGroupItem value="andere" className={cn(CHIP_OUTLINE, durationChipWidth)}>
            Andere
          </ToggleGroupItem>
        </ToggleGroup>
        {customDuration && (
          <>
            <Input
              ref={durationRef}
              id="session-duration"
              type="number"
              inputMode="numeric"
              aria-label="Dauer in Minuten"
              value={customText}
              onChange={(e) => {
                setCustomText(e.target.value);
                setDurationMessage(undefined);
                setTotalMessage(undefined);
              }}
              placeholder="Minuten"
              min={DURATION_MIN_MINUTES}
              max={DURATION_MAX_MINUTES}
              aria-invalid={durationMessage ? true : undefined}
              aria-describedby={durationMessage ? fieldErrorId("session-duration") : undefined}
              disabled={isSaving}
            />
            {durationMessage && (
              <p id={fieldErrorId("session-duration")} className="text-xs text-destructive">
                {durationMessage}
              </p>
            )}
          </>
        )}
      </div>

      {type === "therapie" && (
        <div className="space-y-2">
          <Label>Kategorie</Label>
          <ToggleGroup
            type="single"
            value={category}
            onValueChange={(value) => value && changeCategory(value as SessionCategory)}
            disabled={isSaving}
            spacing={1}
            aria-label="Kategorie"
            className="w-full flex-wrap rounded-xl bg-muted p-1"
          >
            {/* Drei Chips pro Zeile, die zweite Zeile teilen sich zwei gestreckte Chips. */}
            {CATEGORY_OPTIONS.map((c) => (
              <ToggleGroupItem
                key={c.value}
                value={c.value}
                className={cn(CHIP, CHIP_PRIMARY, "flex-[1_1_calc(33.333%-0.25rem)] text-xs")}
              >
                {c.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      )}

      {type === "supervision" && cases.length > 0 && (
        <fieldset
          className="min-w-0"
          aria-invalid={totalMessage ? true : undefined}
          aria-describedby={totalMessage ? fieldErrorId("session-cases") : undefined}
        >
          <legend className="mb-2 text-sm leading-none font-medium">Besprochene Patient:innen</legend>
          <div className="max-h-64 space-y-1.5 overflow-y-auto">
            {cases.map((c) => {
              const isChecked = selectedPatientIds.includes(c.patient.id);
              return (
                <label
                  key={c.patient.id}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors",
                    isChecked ? "border-primary/40 bg-primary-soft" : "border-border hover:border-input"
                  )}
                >
                  <Checkbox checked={isChecked} onCheckedChange={() => toggleCase(c.patient.id)} disabled={isSaving} />
                  <span className="flex-1 text-sm">
                    <span className="font-mono font-medium text-foreground">{c.patient.chiffre}</span>
                    {!c.patient.isActive && <span className="ml-2 text-xs text-muted-foreground">abgeschlossen</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">{sitzungen(c.sessionIds.length)} offen</span>
                  {isDue(c) && <SupervisionDueBadge />}
                </label>
              );
            })}
          </div>
          {selectedCases.length > 1 && perCaseMinutes !== undefined && (
            <p className="mt-2 text-sm font-medium text-foreground">
              Gesamt: {selectedCases.length} × {perCaseMinutes} Min = {selectedCases.length * perCaseMinutes} Min
            </p>
          )}
          {totalMessage && (
            <p id={fieldErrorId("session-cases")} role="alert" className="mt-2 text-xs text-destructive">
              {totalMessage}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Die Dauer gilt je Patient:in. Zugeordnet werden alle offenen Sitzungen der gewählten Patient:innen bis zum
            Datum der Supervision; einzelne Sitzungen lassen sich unter{" "}
            <Link href="/supervision" className="font-medium underline">
              Supervision
            </Link>{" "}
            korrigieren.
          </p>
        </fieldset>
      )}

      {type === "therapie" &&
        (showNotes || notes ? (
          <FormField label="Notiz (optional)" htmlFor="session-notes">
            <Textarea
              id="session-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="h-20 resize-none"
              placeholder="Kurze Notiz …"
              maxLength={2000}
              disabled={isSaving}
            />
          </FormField>
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowNotes(true)} disabled={isSaving} className="self-start">
            <StickyNote />
            Notiz hinzufügen
          </Button>
        ))}

      <ActionError result={errorAt(error, "save")} />
      <Button
        variant="success"
        size="lg"
        onClick={handleSave}
        loading={isSaving}
        disabled={(type === "therapie" && !patientId) || (type === "supervision" && !supervisorId)}
        className="w-full"
      >
        <Check />
        Speichern
      </Button>
    </div>
  );
}
