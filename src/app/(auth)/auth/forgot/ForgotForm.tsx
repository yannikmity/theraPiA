"use client";

import { useState } from "react";
import Link from "next/link";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FORGOT_RESPONSE_MESSAGE } from "@/lib/password-reset-mail";

function BackToLogin() {
  return (
    <Button asChild variant="link">
      <Link href="/auth/login">Zur Anmeldung</Link>
    </Button>
  );
}

export function ForgotForm({ mailEnabled }: { mailEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!mailEnabled) {
    return (
      <Card className="items-center text-center">
        <h1 className="sr-only">Passwort vergessen</h1>
        <p className="text-foreground">
          Wende dich an die Betreiber:in dieser Instanz – dort kann ein Link zum Zurücksetzen für dich erzeugt werden.
        </p>
        <BackToLogin />
      </Card>
    );
  }

  if (sent) {
    return (
      <Card className="items-center text-center">
        <h1 className="sr-only">Passwort vergessen</h1>
        <p className="text-foreground" role="status">
          {sent} Der Link ist 1 Stunde gültig. Schau auch im Spam-Ordner nach.
        </p>
        <BackToLogin />
      </Card>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Anfrage fehlgeschlagen");
        return;
      }
      setSent(data.message || FORGOT_RESPONSE_MESSAGE);
    } catch {
      setError("Ein Fehler ist aufgetreten");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h1>Passwort vergessen</h1>
        </CardTitle>
        <CardDescription>Gib die Adresse deines Kontos ein. Du bekommst einen Link, mit dem du ein neues Passwort festlegst.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="forgot-email">E-Mail</Label>
            <Input
              id="forgot-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            {loading ? "Senden …" : "Link anfordern"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link href="/auth/login" className="font-medium text-primary hover:underline">
              Zurück zur Anmeldung
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
