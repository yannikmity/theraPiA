"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { isLoginErrorCode, loginErrorMessage } from "@/lib/login-errors";
import { track } from "@/lib/analytics/track";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ notice }: { notice: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError(loginErrorMessage(result.code));
        // Nur die Kategorie (credentials, rate_limited, unavailable) – nie die Adresse.
        track("login_failed", { reason: isLoginErrorCode(result.code) ? result.code : "credentials" });
      } else if (result?.ok) {
        track("login_success");
        router.push("/");
      }
    } catch (err) {
      setError("Ein Fehler ist aufgetreten");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h1>Anmelden</h1>
        </CardTitle>
        <CardDescription>Anmelden, um fortzufahren</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {notice && (
            <Alert variant="success">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email-address">E-Mail</Label>
            <Input
              id="email-address"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" loading={loading}>
            {loading ? "Anmelden …" : "Anmelden"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Noch kein Konto?{" "}
            <Link href="/auth/register" className="font-medium text-primary hover:underline">
              Jetzt registrieren
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
