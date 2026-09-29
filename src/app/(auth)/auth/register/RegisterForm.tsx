"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegisterForm({
  inviteToken,
  registrationOpen,
  closedMode,
  isSetup,
}: {
  inviteToken: string | null;
  registrationOpen: boolean;
  closedMode: boolean;
  isSetup: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [name, setName] = useState("");
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

    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name, invite: inviteToken ?? undefined }),
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
