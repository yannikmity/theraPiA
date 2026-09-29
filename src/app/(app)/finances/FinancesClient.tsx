"use client";

import { useState } from "react";
import { Save } from "lucide-react";
import { FinancialSettings, Supervisor, SupervisorId } from "@/types";
import { ActionError } from "@/components/ActionError";
import { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/run-action";
import { FORECAST_LOOKBACK_WEEKS, PLANNED_SESSIONS_PER_WEEK_MAX } from "@/lib/constants";
import { FormField, SectionHeader } from "@/components/ui";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { saveFinancialSettings } from "./actions";
import { ExpenseExport } from "./ExpenseExport";

interface FinancesClientProps {
  initialSettings: FinancialSettings;
  initialSupervisors: Supervisor[];
  initialQuarters: { quarter: string; income: number; costs: number; profit: number }[];
  initialTotalIncome: number;
  initialTotalCosts: number;
  expenseYears: number[];
}

export function FinancesClient({
  initialSettings,
  initialSupervisors,
  initialQuarters,
  initialTotalIncome,
  initialTotalCosts,
  expenseYears,
}: FinancesClientProps) {
  const [settings, setSettings] = useState<FinancialSettings>(initialSettings);
  const [quarters, setQuarters] = useState(initialQuarters);
  const [totalIncome, setTotalIncome] = useState(initialTotalIncome);
  const [totalCosts, setTotalCosts] = useState(initialTotalCosts);
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<ActionResult<unknown> | null>(null);

  async function handleSave() {
    if (!settings) return;
    setIsSaving(true);
    setError(null);
    const result = await runAction(() => saveFinancialSettings(settings));
    setIsSaving(false);
    if (result.success) {
      setQuarters(result.data.quarters);
      setTotalIncome(result.data.totalIncome);
      setTotalCosts(result.data.totalCosts);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setError(result);
    }
  }

  const maxBarValue = Math.max(
    ...quarters.map((q) => Math.max(q.income, q.costs)),
    1
  );

  const result = totalIncome - totalCosts;
  const euro = (value: number) =>
    value.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="space-y-4">
      <PageHeader title="Finanzen" />

      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <Card className="text-center">
          <p className="text-lg font-bold text-success md:text-2xl">{euro(totalIncome)}</p>
          <p className="text-[10px] text-muted-foreground md:text-xs">Einnahmen</p>
        </Card>
        <Card className="text-center">
          <p className="text-lg font-bold text-destructive md:text-2xl">{euro(totalCosts)}</p>
          <p className="text-[10px] text-muted-foreground md:text-xs">Ausgaben</p>
        </Card>
        <Card className="text-center">
          <p className={`text-lg font-bold md:text-2xl ${result >= 0 ? "text-success" : "text-destructive"}`}>
            {euro(result)}
          </p>
          <p className="text-[10px] text-muted-foreground md:text-xs">Ergebnis</p>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        {quarters.length > 0 && (
          // Supervisionen erzeugen immer ein Quartal: ohne Quartale gibt es auch keine Jahre für den Export (#65).
          <div className="space-y-4">
            <Card>
              <SectionHeader>Quartalsübersicht</SectionHeader>
              <div className="space-y-3">
                {quarters.map((q) => (
                  <div key={q.quarter}>
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-xs font-medium text-foreground">{q.quarter}</span>
                      <span className={`text-xs font-medium ${q.profit >= 0 ? "text-success" : "text-destructive"}`}>
                        {q.profit >= 0 ? "+" : ""}
                        {q.profit.toLocaleString("de-DE")} EUR
                      </span>
                    </div>
                    <div className="mb-0.5 flex items-center gap-2">
                      <span className="w-6 text-[10px] text-muted-foreground">+</span>
                      <div className="h-4 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div className="h-full rounded-sm bg-success" style={{ width: `${(q.income / maxBarValue) * 100}%` }} />
                      </div>
                      <span className="w-14 text-right text-[10px] text-muted-foreground">
                        {q.income.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 text-[10px] text-muted-foreground">-</span>
                      <div className="h-4 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div className="h-full rounded-sm bg-destructive" style={{ width: `${(q.costs / maxBarValue) * 100}%` }} />
                      </div>
                      <span className="w-14 text-right text-[10px] text-muted-foreground">
                        {q.costs.toLocaleString("de-DE", { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <ExpenseExport years={expenseYears} />
          </div>
        )}

        <Card>
          <SectionHeader>Einstellungen</SectionHeader>
          <FormField label="Einnahme je Behandlungsstunde (50 Min, EUR)" htmlFor="income-per-hour">
            <Input
              id="income-per-hour"
              type="number"
              value={settings.incomePerHour || ""}
              onChange={(e) => setSettings({ ...settings, incomePerHour: Number(e.target.value) })}
              step="0.01"
              min="0"
              disabled={isSaving}
            />
          </FormField>
          <FormField label="Geplante Sitzungen pro Woche (optional)" htmlFor="planned-sessions">
            <Input
              id="planned-sessions"
              type="number"
              inputMode="numeric"
              min={0}
              max={PLANNED_SESSIONS_PER_WEEK_MAX}
              step={1}
              value={settings.plannedSessionsPerWeek ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  plannedSessionsPerWeek: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              placeholder={`leer = Schnitt der letzten ${FORECAST_LOOKBACK_WEEKS} Wochen`}
              disabled={isSaving}
            />
          </FormField>
          <p className="text-xs text-muted-foreground">
            Das Dashboard rechnet die Quartalsprognose mit dieser Zahl; ohne Angabe mit dem Schnitt der letzten{" "}
            {FORECAST_LOOKBACK_WEEKS} Wochen.
          </p>

          {initialSupervisors.map((sv) => (
            <FormField key={sv.id} label={`Kosten je SV-Einheit – ${sv.name} (EUR)`} htmlFor={`cost-${sv.id}`}>
              <Input
                id={`cost-${sv.id}`}
                type="number"
                value={settings.supervisionCosts[sv.id as SupervisorId] || ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    supervisionCosts: { ...settings.supervisionCosts, [sv.id]: Number(e.target.value) },
                  })
                }
                step="0.01"
                min="0"
                disabled={isSaving}
              />
            </FormField>
          ))}

          <ActionError result={error} />
          <Button variant={saved ? "success" : "default"} onClick={handleSave} loading={isSaving} className="w-full">
            <Save />
            {saved ? "Gespeichert!" : "Einstellungen speichern"}
          </Button>
        </Card>
      </div>
    </div>
  );
}
