"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MIN_PASSWORD_LENGTH } from "@/lib/constants";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  // Meldung samt Feld, das danach den Fokus bekommt (#15); `null` bei Server-, Token- und Netzfehlern, die kein Feld
  // betreffen. Jede Meldung ist ein neues Objekt – auch dieselbe Meldung ein zweites Mal löst den Effekt aus.
  const [error, setError] = useState<{ message: string; field: "password" | "confirm" | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Fokus ins betroffene Feld: es verweist per aria-describedby auf die Meldung, Screenreader lesen beides zusammen.
  // Betrifft die Meldung kein Feld, bekommt sie selbst den Fokus.
  useEffect(() => {
    if (!error) return;
    const target = error.field === "confirm" ? confirmRef : error.field === "password" ? passwordRef : errorRef;
    target.current?.focus();
  }, [error]);

  if (!token) {
    return (
      <Card className="items-center text-center">
        {/* Seitenüberschrift für Screenreader; sichtbar bleibt nur der Hinweis. */}
        <h1 className="sr-only">Neues Passwort setzen</h1>
        <p className="text-foreground">
          Dieser Link ist unvollständig. Fordere einen neuen an oder wende dich an die Administration.
        </p>
        <Button asChild variant="link">
          <Link href="/auth/forgot">Neuen Link anfordern</Link>
        </Button>
        <Button asChild variant="link">
          <Link href="/auth/login">Zur Anmeldung</Link>
        </Button>
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== passwordConfirm) {
      setError({ message: "Passwörter stimmen nicht überein", field: "confirm" });
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError({ message: `Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein`, field: "password" });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError({ message: data.error || "Zurücksetzen fehlgeschlagen", field: null });
        return;
      }
      router.push("/auth/login?reset=true");
    } catch {
      setError({ message: "Ein Fehler ist aufgetreten", field: null });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h1>Neues Passwort setzen</h1>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* noValidate: eigene, verknüpfte Meldung statt Browser-Tooltip (#15). */}
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Neues Passwort</Label>
            <Input
              id="new-password"
              ref={passwordRef}
              type="password"
              autoComplete="new-password"
              required
              placeholder={`Mindestens ${MIN_PASSWORD_LENGTH} Zeichen`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error?.field === "password" ? true : undefined}
              aria-describedby={error ? "reset-error" : undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password-confirm">Passwort wiederholen</Label>
            <Input
              id="new-password-confirm"
              ref={confirmRef}
              type="password"
              autoComplete="new-password"
              required
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              aria-invalid={error?.field === "confirm" ? true : undefined}
              aria-describedby={error ? "reset-error" : undefined}
            />
          </div>
          {error && (
            <Alert variant="destructive" id="reset-error" ref={errorRef} tabIndex={-1}>
              <AlertDescription>{error.message}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" loading={loading}>
            {loading ? "Speichern …" : "Passwort speichern"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
