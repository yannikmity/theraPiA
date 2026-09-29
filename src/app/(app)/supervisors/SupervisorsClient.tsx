"use client";

import { useState } from "react";
import { Plus, X, Pencil } from "lucide-react";
import { Supervisor } from "@/types";
import { ActionError, errorAt, type ScopedActionError } from "@/components/ActionError";
import { runAction } from "@/lib/run-action";
import { FormField, SectionHeader } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { addSupervisor, updateSupervisorAction } from "./actions";

interface SupervisorsClientProps {
  initialSupervisors: Supervisor[];
}

export function SupervisorsClient({ initialSupervisors }: SupervisorsClientProps) {
  const [supervisors, setSupervisors] = useState(initialSupervisors);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [costPerHour, setCostPerHour] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<ScopedActionError | null>(null);

  function openAddForm() {
    setEditingId(null);
    setName("");
    setCostPerHour("");
    setShowForm(true);
    setError(null);
  }

  function openEditForm(sv: Supervisor) {
    setEditingId(sv.id);
    setName(sv.name);
    setCostPerHour(sv.costPerHour != null ? String(sv.costPerHour) : "");
    setShowForm(true);
    setError(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setError(null);
  }

  // scope: "form" für Anlegen/Bearbeiten, `supervisor:${id}` für Aktivieren/Deaktivieren – die Meldung steht dort, wo
  // geklickt wurde, nicht am Seitenanfang (#28, #56).
  async function saveSupervisor(
    input: Parameters<typeof updateSupervisorAction>[0] | Parameters<typeof addSupervisor>[0],
    scope: string
  ) {
    setIsSaving(true);
    setError(null);
    const result = await runAction(() => ("id" in input ? updateSupervisorAction(input) : addSupervisor(input)));
    setIsSaving(false);
    if (result.success) {
      setSupervisors(result.data.supervisors);
      return true;
    }
    setError({ scope, result });
    return false;
  }

  async function handleAdd() {
    if (!name.trim()) return;
    if (await saveSupervisor({ name: name.trim(), costPerHour: costPerHour ? Number(costPerHour) : null }, "form")) closeForm();
  }

  async function handleUpdate() {
    const existing = supervisors.find((s) => s.id === editingId);
    if (!editingId || !name.trim() || !existing) return;
    if (await saveSupervisor({ id: editingId, name: name.trim(), costPerHour: costPerHour ? Number(costPerHour) : null, isActive: existing.isActive }, "form")) {
      closeForm();
    }
  }

  function handleToggleActive(sv: Supervisor) {
    void saveSupervisor({ id: sv.id, name: sv.name, costPerHour: sv.costPerHour, isActive: !sv.isActive }, `supervisor:${sv.id}`);
  }

  const active = supervisors.filter((s) => s.isActive);
  const inactive = supervisors.filter((s) => !s.isActive);

  const costLabel = (sv: Supervisor) =>
    sv.costPerHour != null ? `${sv.costPerHour.toLocaleString("de-DE")} EUR je SV-Einheit` : "Kosten nicht festgelegt";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Supervisor:innen"
        backHref="/profile"
        actions={
          <Button variant="link" size="sm" onClick={openAddForm}>
            <Plus /> Neu
          </Button>
        }
      />

      {showForm && (
        <Card className="border-primary/40">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-foreground">{editingId ? "Supervisor:in bearbeiten" : "Neue:r Supervisor:in"}</h2>
            <Button variant="ghost" size="icon-sm" aria-label="Formular schließen" onClick={closeForm}>
              <X />
            </Button>
          </div>
          <ActionError result={errorAt(error, "form")} />
          <FormField label="Name" htmlFor="supervisor-name">
            <Input
              id="supervisor-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z. B. Supervision Nord"
              autoFocus
              disabled={isSaving}
            />
          </FormField>
          <FormField label="Kosten je SV-Einheit (50 Min, EUR, optional)" htmlFor="supervisor-cost">
            <Input
              id="supervisor-cost"
              type="number"
              value={costPerHour}
              onChange={(e) => setCostPerHour(e.target.value)}
              placeholder="z. B. 80"
              step="0.01"
              min="0"
              disabled={isSaving}
            />
          </FormField>
          <Button onClick={editingId ? handleUpdate : handleAdd} className="w-full" loading={isSaving}>
            {editingId ? "Speichern" : "Anlegen"}
          </Button>
        </Card>
      )}

      {active.length > 0 && (
        <section className="space-y-2">
          <SectionHeader>Aktiv ({active.length})</SectionHeader>
          <div className="grid gap-2 md:grid-cols-2">
            {active.map((sv) => (
              <Card key={sv.id}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-foreground">{sv.name}</p>
                    <p className="text-xs text-muted-foreground">{costLabel(sv)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon-sm" onClick={() => openEditForm(sv)} aria-label={`${sv.name} bearbeiten`}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleActive(sv)}
                      disabled={isSaving}
                      className="hover:border-warning hover:text-warning"
                    >
                      Deaktivieren
                    </Button>
                  </div>
                </div>
                <ActionError result={errorAt(error, `supervisor:${sv.id}`)} />
              </Card>
            ))}
          </div>
        </section>
      )}

      {inactive.length > 0 && (
        <section className="space-y-2">
          <SectionHeader>Inaktiv ({inactive.length})</SectionHeader>
          <div className="grid gap-2 md:grid-cols-2">
            {inactive.map((sv) => (
              // Keine Transparenz: Text bliebe sonst unter WCAG AA (vgl. abgeschlossene Patient:innen).
              <Card key={sv.id}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-foreground">{sv.name}</p>
                      <Badge variant="muted">inaktiv</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{costLabel(sv)}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleActive(sv)}
                    disabled={isSaving}
                    className="hover:border-success hover:text-success"
                  >
                    Aktivieren
                  </Button>
                </div>
                <ActionError result={errorAt(error, `supervisor:${sv.id}`)} />
              </Card>
            ))}
          </div>
        </section>
      )}

      {supervisors.length === 0 && !showForm && (
        <div className="py-12 text-center">
          <p className="mb-3 text-muted-foreground">Noch keine Supervisor:innen angelegt</p>
          <Button onClick={openAddForm}>Erste:n Supervisor:in anlegen</Button>
        </div>
      )}
    </div>
  );
}
