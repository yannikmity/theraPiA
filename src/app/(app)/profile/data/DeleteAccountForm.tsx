"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { Trash2, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { runAction } from "@/lib/run-action";
import { deleteOwnAccountAction } from "@/lib/actions/account";
import { track } from "@/lib/analytics/track";

const LOGIN_AFTER_DELETE = "/auth/login?accountDeleted=true";

// Gefahrenzone: Passwort erneut eingeben, dann Inline-Nachfrage (ConfirmButton), dann die Server Action – sie prüft
// Passwort und letzten Admin und liefert deren Meldung als error. Nach Erfolg signOut, damit auch das Cookie
// verschwindet (die Sitzung ist serverseitig schon ungültig), und Login mit Hinweis.
export function DeleteAccountForm({ isAdmin }: { isAdmin: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function confirmDelete() {
    // Passwort bei offener Nachfrage geleert: nichts senden, der Knopf ist dann ohnehin wieder gesperrt.
    if (!password) return;
    setBusy(true);
    setError("");
    const result = await runAction(() => deleteOwnAccountAction({ password }));
    if (!result.success) {
      setError(result.error);
      setPassword("");
      setBusy(false);
      return;
    }
    track("account_deleted");
    // busy bleibt true bis zur Weiterleitung – kein zweiter Klick.
    try {
      await signOut({ callbackUrl: LOGIN_AFTER_DELETE });
    } catch {
      // Account ist gelöscht, die Sitzung serverseitig ungültig – notfalls hart weiterleiten statt hängen zu bleiben.
      // Bewusst harte Navigation: verwirft den Client-Zustand der gelöschten Sitzung vollständig.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(LOGIN_AFTER_DELETE);
    }
  }

  return (
    <Card className="border-destructive/40">
      <SectionHeader>Account löschen</SectionHeader>
      {/* Erklärung als normaler Text, nicht als Alert: role="alert" gehört nur der echten Fehlermeldung unten. */}
      <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive-soft px-4 py-3 text-sm text-destructive">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="space-y-1">
          <p>
            Löscht deinen Account und alle Daten endgültig: Patient:innen (Chiffren), Therapiesitzungen, Supervisionen,
            Supervisor:innen, Gruppen und Doppelstunden, Finanzen sowie dein Feedback aus dem Feedback-Widget. Das lässt sich
            nicht rückgängig machen.
          </p>
          <p>Vorher exportieren, was du behalten willst (oben).</p>
          {isAdmin && <p>Der letzte aktive Admin-Account kann nicht gelöscht werden – vorher eine zweite Person als Admin einladen.</p>}
        </div>
      </div>
      {error && (
        <Alert variant="destructive" id="delete-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <FormField label="Passwort zur Bestätigung" htmlFor="delete-password">
        <Input
          id="delete-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "delete-error" : undefined}
          disabled={busy}
        />
      </FormField>
      <ConfirmButton
        label={
          <>
            <Trash2 size={16} /> Account endgültig löschen
          </>
        }
        question="Account wirklich löschen?"
        description="Alle Daten werden sofort und unwiderruflich gelöscht. Du wirst abgemeldet."
        confirmLabel="Ja, Account löschen"
        onConfirm={confirmDelete}
        loading={busy}
        disabled={password.length === 0}
        className="h-10 w-full border border-destructive/40 px-4 text-destructive hover:bg-destructive-soft"
      />
    </Card>
  );
}
