"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Plus, ChevronRight, X } from "lucide-react";
import { groupSessionCounts, groupIncomeTotal } from "@/lib/calculations";
import { Group, GroupSession } from "@/types";
import type { EbmStaffel } from "@/lib/ausbildungsregeln/model";
import { ActionError } from "@/components/ActionError";
import { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/run-action";
import { FormField } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/PageHeader";
import { addGroup } from "./actions";

interface GroupsClientProps {
  initialGroups: Group[];
  initialGroupSessions: GroupSession[];
  ebmStaffeln: EbmStaffel[];
}

export function GroupsClient({ initialGroups, initialGroupSessions, ebmStaffeln }: GroupsClientProps) {
  const [groups, setGroups] = useState(initialGroups);
  const [groupSessions, setGroupSessions] = useState(initialGroupSessions);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [plannedSessionCount, setPlannedSessionCount] = useState(20);
  const [avgKids, setAvgKids] = useState(9);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<ActionResult<unknown> | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (isSaving || !name.trim()) return;
    setIsSaving(true);
    setError(null);
    const result = await runAction(() => addGroup({ name: name.trim(), startDate, plannedSessionCount, avgKids }));
    setIsSaving(false);
    if (result.success) {
      setGroups(result.data.groups);
      setGroupSessions(result.data.groupSessions);
      setName("");
      setShowForm(false);
    } else {
      setError(result);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gruppen"
        actions={
          <Button variant="link" size="sm" onClick={() => setShowForm(true)}>
            <Plus /> Neu
          </Button>
        }
      />

      {showForm && (
        // Formular: Enter im Feld legt an (#51).
        <Card asChild className="border-primary/40">
          <form noValidate onSubmit={handleAdd}>
            <div className="flex items-center justify-between">
              <h2 className="font-medium text-foreground">Neue Gruppe</h2>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Formular schließen" onClick={() => setShowForm(false)}>
                <X />
              </Button>
            </div>
            <ActionError result={error} />
            <FormField label="Gruppenname" htmlFor="group-name">
              <Input id="group-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Kindergruppe 1" autoFocus disabled={isSaving} />
            </FormField>
            <FormField label="Startdatum" htmlFor="group-start">
              <Input id="group-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} disabled={isSaving} />
            </FormField>
            <FormField label="Geplante Sitzungen" htmlFor="group-planned">
              <Input id="group-planned" type="number" value={plannedSessionCount} onChange={(e) => setPlannedSessionCount(Number(e.target.value))} min={1} disabled={isSaving} />
            </FormField>
            <FormField label="Kinder (Ø)" htmlFor="group-kids">
              <Input id="group-kids" type="number" value={avgKids} onChange={(e) => setAvgKids(Number(e.target.value))} min={0} disabled={isSaving} />
            </FormField>
            <Button type="submit" className="w-full" loading={isSaving}>
              Anlegen
            </Button>
          </form>
        </Card>
      )}

      {groups.length > 0 ? (
        <div className="grid gap-2 md:grid-cols-2">
          {groups.map((group) => {
            const sessions = groupSessions.filter((s) => s.groupId === group.id);
            const counts = groupSessionCounts(sessions);
            const income = groupIncomeTotal(sessions, ebmStaffeln);
            return (
              <Card key={group.id} asChild>
                <Link href={`/groups/${group.id}`} className="flex-row items-center justify-between transition-shadow hover:shadow-md">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{group.name}</span>
                      <Badge variant="primary-soft">
                        {counts.durchgefuehrt}/{group.plannedSessionCount}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Seit {format(parseISO(group.startDate), "dd.MM.yyyy")} · {income.toLocaleString("de-DE")} EUR
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground/60" aria-hidden="true" />
                </Link>
              </Card>
            );
          })}
        </div>
      ) : (
        !showForm && (
          <div className="py-12 text-center">
            <p className="mb-3 text-muted-foreground">Noch keine Gruppen angelegt</p>
            <Button onClick={() => setShowForm(true)}>Erste Gruppe anlegen</Button>
          </div>
        )
      )}
    </div>
  );
}
