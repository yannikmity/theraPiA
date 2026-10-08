"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MIN_PASSWORD_LENGTH, PASSWORD_TOO_LONG_MESSAGE, exceedsPasswordBytes } from "@/lib/constants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SetupState } from "@/lib/setup-token";

export function RegisterForm({
  inviteToken,
  registrationOpen,
  closedMode,
  isSetup,
  setup = "open",
}: {
  inviteToken: string | null;
  registrationOpen: boolean;
  closedMode: boolean;
  isSetup: boolean;
  // Einrichtung des ersten Accounts: Code aus SETUP_TOKEN nötig, gesperrt (SETUP_TOKEN fehlt) oder frei (lokal).
  setup?: SetupState;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const codeRequired = isSetup && setup === "code-required";
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // Validation
    if (!email || !password || !name) {
      setError("Alle Felder sind erforderlich");
      return;
    }

    if (password !== passwordConfirm) {
      setError("Passwörter stimmen nicht überein");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein`);
      return;
    }

    if (exceedsPasswordBytes(password)) {
      setError(PASSWORD_TOO_LONG_MESSAGE);
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          name,
          invite: inviteToken ?? undefined,
          setupToken: codeRequired ? setupToken : undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Registrierung fehlgeschlagen");
        return;
      }

      // Redirect to login
      router.push("/auth/login?registered=true");
    } catch (err) {
      setError("Ein Fehler ist aufgetreten");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (isSetup && setup === "blocked") {
    return (
      <Card className="items-center text-center">
        <h1 className="sr-only">Registrieren</h1>
        <p className="text-foreground">
          Diese Instanz ist noch nicht eingerichtet. Für den ersten Account muss die Betreiberin oder der Betreiber{" "}
          <code>SETUP_TOKEN</code> in der <code>.env</code> setzen und die App neu starten.
        </p>
      </Card>
    );
  }

  if (!registrationOpen) {
    return (
      <Card className="items-center text-center">
        {/* Seitenüberschrift für Screenreader; sichtbar bleibt nur der Hinweis. */}
        <h1 className="sr-only">Registrieren</h1>
        <p className="text-foreground">
          {closedMode
            ? "Registrierung ist auf dieser Instanz deaktiviert."
            : "Registrierung nur mit Einladung. Bitte wende dich an die Administration deiner Instanz."}
        </p>
        <Button asChild variant="link">
          <Link href="/auth/login">Zur Anmeldung</Link>
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h1>Registrieren</h1>
        </CardTitle>
        <CardDescription>Neuen Account erstellen</CardDescription>
      </CardHeader>
      <CardContent>
        {isSetup && (
          <Alert variant="info">
            <AlertDescription>Erster Account dieser Instanz – er erhält Administrationsrechte.</AlertDescription>
          </Alert>
        )}
        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" type="text" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email-address">E-Mail</Label>
            <Input id="email-address" name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              placeholder={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password-confirm">Passwort bestätigen</Label>
            <Input
              id="password-confirm"
              name="password-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </div>
          {codeRequired && (
            <div className="space-y-1.5">
              <Label htmlFor="setup-token">Einrichtungscode</Label>
              <Input
                id="setup-token"
                name="setup-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                required
                aria-describedby="setup-token-hint"
                value={setupToken}
                onChange={(e) => setSetupToken(e.target.value)}
              />
              <p id="setup-token-hint" className="text-sm text-muted-foreground">
                Steht als <code>SETUP_TOKEN</code> in der <code>.env</code> der Instanz.
              </p>
            </div>
          )}
          <Button type="submit" className="w-full" loading={loading}>
            {loading ? "Wird angelegt …" : "Registrieren"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Schon registriert?{" "}
            <Link href="/auth/login" className="font-medium text-primary hover:underline">
              Jetzt anmelden
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
