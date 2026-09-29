"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Coins, Copy, GraduationCap, KeyRound, Lock, MessageSquareText, Unlock, UserPlus, X } from "lucide-react";
import { ActionError, errorAt, type ScopedActionError } from "@/components/ActionError";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField, fieldErrorId } from "@/components/ui";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { PageHeader } from "@/components/layout/PageHeader";
import type { ActionResult } from "@/lib/action-result";
import { runAction } from "@/lib/run-action";
import type { AdminData } from "./actions";
import { createInvitationAction, revokeInvitationAction, createResetLinkAction, setUserDisabledAction } from "./actions";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE");
}

const COPY_FAILED = "Kopieren nicht möglich – bitte den Link markieren und von Hand kopieren.";

function LinkBox({ label, link, onClose }: { label: string; link: string; onClose: () => void }) {
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");

  // Ohne Berechtigung oder ohne HTTPS lehnt der Browser die Zwischenablage ab – dann bleibt der Link markierbar (#15).
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  return (
    <Card className="border-primary/40">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Schließen">
          <X />
        </Button>
      </div>
      <p className="text-xs break-all text-muted-foreground select-all">{link}</p>
      <Button variant="link" size="sm" className="justify-start px-0 has-[>svg]:px-0" onClick={copyLink}>
        <Copy /> {copy === "copied" ? "Kopiert" : "Link kopieren"}
      </Button>
      {copy === "failed" && (
        <p role="alert" className="text-xs text-destructive">
          {COPY_FAILED}
        </p>
      )}
      <p className="text-xs text-muted-foreground">Der Link wird nur jetzt angezeigt. Bitte direkt und vertraulich weitergeben.</p>
    </Card>
  );
}

// Genau eine Aktion zur Zeit (#15): `busy` sperrt alle Knöpfe und zeigt den Spinner am ausgelösten; `busyRef` greift
// schon vor dem nächsten Render, damit ein Doppelklick keine zweite Einladung erzeugt. Fehler stehen an der Stelle
// der Aktion (scope), Feldfehler der Einladung direkt unter dem Feld.
export function AdminClient({ initialData, currentUserId }: { initialData: AdminData; currentUserId: string }) {
  const [data, setData] = useState(initialData);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"pia" | "admin">("pia");
  const [withDemoData, setWithDemoData] = useState(false);
  const [shownLink, setShownLink] = useState<{ label: string; link: string } | null>(null);
  const [error, setError] = useState<ScopedActionError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);

  async function run<T>(scope: string, call: () => Promise<ActionResult<T>>, onSuccess: (data: T) => void) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(scope);
    setError(null);
    const result = await runAction(call);
    busyRef.current = false;
    setBusy(null);
    if (result.success) onSuccess(result.data);
    else setError({ scope, result });
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    const demo = withDemoData;
    void run("invite", () => createInvitationAction({ email: email.trim() || null, role, withDemoData: demo }), (d) => {
      setData(d.data);
      setShownLink({
        label: demo ? "Demo-Einladungslink (14 Tage gültig, mit Beispieldaten)" : "Einladungslink (14 Tage gültig)",
        link: d.link,
      });
      setEmail("");
      setWithDemoData(false);
    });
  }

  const revoke = (id: string) => run(`invitation:${id}`, () => revokeInvitationAction({ id }), setData);
  const resetLink = (userId: string, name: string) =>
    run(`reset:${userId}`, () => createResetLinkAction({ userId }), (d) =>
      setShownLink({ label: `Reset-Link für ${name} (24 Stunden gültig)`, link: d.link })
    );
  const toggleDisabled = (userId: string, disabled: boolean) =>
    run(`disable:${userId}`, () => setUserDisabledAction({ userId, disabled }), setData);

  const inviteError = errorAt(error, "invite");
  const emailError = inviteError && !inviteError.success ? inviteError.fieldErrors?.email?.[0] : undefined;
  const demoError = inviteError && !inviteError.success ? inviteError.fieldErrors?.withDemoData?.[0] : undefined;
  const locked = busy !== null;
  const emailRef = useRef<HTMLInputElement>(null);

  // Während des Aufrufs ist das Feld gesperrt und der Fokus fällt auf body – erst nach dem Entsperren zurück ins Feld,
  // damit Screenreader den Feldfehler ansagen.
  useEffect(() => {
    if (emailError && !locked) emailRef.current?.focus();
  }, [emailError, locked]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Administration" />
      {shownLink && <LinkBox key={shownLink.link} {...shownLink} onClose={() => setShownLink(null)} />}

      <Card asChild>
        <Link href="/admin/feedback" className="flex-row items-center gap-3 transition-colors hover:bg-muted">
          <div className="rounded-lg bg-primary-soft p-2 text-primary">
            <MessageSquareText size={20} aria-hidden="true" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Feedback</p>
            <p className="text-xs text-muted-foreground">Rückmeldungen aus dem Feedback-Widget lesen</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground/60" aria-hidden="true" />
        </Link>
      </Card>

      <Card asChild>
        <Link href="/admin/ausbildungsprofil" className="flex-row items-center gap-3 transition-colors hover:bg-muted">
          <div className="rounded-lg bg-primary-soft p-2 text-primary">
            <GraduationCap size={20} aria-hidden="true" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">Ausbildungsprofil</p>
            <p className="text-xs text-muted-foreground">Stundenziele, Verhältnis und Gruppenziele der Instanz</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground/60" aria-hidden="true" />
        </Link>
      </Card>

      <Card asChild>
        <Link href="/admin/ebm-staffel" className="flex-row items-center gap-3 transition-colors hover:bg-muted">
          <div className="rounded-lg bg-primary-soft p-2 text-primary">
            <Coins size={20} aria-hidden="true" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">EBM-Staffel</p>
            <p className="text-xs text-muted-foreground">Gruppenhonorar je Kinderzahl, mit Gültigkeitsbeginn</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground/60" aria-hidden="true" />
        </Link>
      </Card>

      <Card asChild>
        {/* noValidate: die Adresse prüft das Server-Schema, die Meldung steht am Feld – kein Browser-Tooltip. */}
        <form onSubmit={invite} noValidate>
          <p className="flex items-center gap-2 font-medium text-foreground">
            <UserPlus size={18} aria-hidden="true" /> Einladen
          </p>
          <FormField label="E-Mail (optional, bindet die Einladung an diese Adresse)" htmlFor="invite-email" error={emailError}>
            <Input
              ref={emailRef}
              id="invite-email"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? fieldErrorId("invite-email") : undefined}
              disabled={locked}
            />
          </FormField>
          <FormField label="Rolle" htmlFor="invite-role">
            <NativeSelect
              id="invite-role"
              wrapperClassName="w-full"
              className="w-full"
              value={role}
              onChange={(e) => {
                const next = e.target.value as "pia" | "admin";
                setRole(next);
                // Beispieldaten nur für PiA (#9) – beim Wechsel zu Administration zurücknehmen.
                if (next === "admin") setWithDemoData(false);
              }}
              disabled={locked}
            >
              <NativeSelectOption value="pia">PiA</NativeSelectOption>
              <NativeSelectOption value="admin">Administration</NativeSelectOption>
            </NativeSelect>
          </FormField>
          <label className="flex items-start gap-2 text-sm text-foreground">
            <Checkbox
              className="mt-0.5"
              checked={withDemoData}
              onCheckedChange={(checked) => setWithDemoData(checked === true)}
              disabled={locked || role === "admin"}
              aria-describedby="invite-demo-hint"
            />
            <span>Mit Beispieldaten starten (Demo-Zugang)</span>
          </label>
          <p id="invite-demo-hint" className="text-xs text-muted-foreground">
            Der Account startet mit fiktiven Patient:innen, Sitzungen, Supervisionen und einer Gruppe und bleibt als
            Demo-Account gekennzeichnet. Nur für PiA-Accounts, nicht für echte Ausbildungsdaten.
          </p>
          {demoError && (
            <p role="alert" className="text-xs text-destructive">
              {demoError}
            </p>
          )}
          {!emailError && !demoError && <ActionError result={inviteError} />}
          <Button type="submit" className="w-full" loading={busy === "invite"} disabled={locked}>
            Einladungslink erzeugen
          </Button>
        </form>
      </Card>

      {data.invitations.length > 0 && (
        <Card className="gap-0 divide-y divide-border">
          <p className="pb-2 font-medium text-foreground">Offene Einladungen</p>
          {data.invitations.map((inv) => (
            <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="text-foreground">
                {inv.email ?? "ohne Adresse"} · {inv.role === "admin" ? "Administration" : "PiA"} · bis {formatDate(inv.expiresAt)}
                {inv.withDemoData && " · mit Beispieldaten"}
              </span>
              <Button
                variant="link"
                size="sm"
                className="text-destructive"
                onClick={() => revoke(inv.id)}
                loading={busy === `invitation:${inv.id}`}
                disabled={locked}
              >
                Widerrufen
              </Button>
              <ActionError result={errorAt(error, `invitation:${inv.id}`)} />
            </div>
          ))}
        </Card>
      )}

      <Card className="gap-0 divide-y divide-border">
        <p className="pb-2 font-medium text-foreground">Accounts</p>
        {data.users.map((u) => (
          <div key={u.id} className="space-y-1 py-2">
            <p className="flex flex-wrap items-center gap-2 text-sm text-foreground">
              {u.name}
              {u.role === "admin" && <Badge variant="primary-soft">Administration</Badge>}
              {u.disabled && <Badge variant="destructive-soft">gesperrt</Badge>}
              {u.demo && <Badge variant="warning-soft">Demo</Badge>}
            </p>
            <p className="text-xs text-muted-foreground">
              {u.email} · seit {formatDate(u.createdAt)}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="link"
                size="sm"
                className="px-0 has-[>svg]:px-0"
                onClick={() => resetLink(u.id, u.name)}
                loading={busy === `reset:${u.id}`}
                disabled={locked}
              >
                <KeyRound /> Reset-Link
              </Button>
              {u.id !== currentUserId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleDisabled(u.id, !u.disabled)}
                  loading={busy === `disable:${u.id}`}
                  disabled={locked}
                >
                  {u.disabled ? <Unlock /> : <Lock />} {u.disabled ? "Entsperren" : "Sperren"}
                </Button>
              )}
            </div>
            <ActionError result={errorAt(error, `reset:${u.id}`)} />
            <ActionError result={errorAt(error, `disable:${u.id}`)} />
          </div>
        ))}
      </Card>
    </div>
  );
}
