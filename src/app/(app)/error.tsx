"use client";

import { useEffect } from "react";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Fehlerseite des App-Bereichs (#56): fängt Renderfehler aller Seiten unter (app) – innerhalb von AppShell, die
// Navigation bleibt. Next 16 übergibt retry() (lädt die Daten neu und rendert erneut). Die Fehlerkennung (digest)
// findet sich im Server-Log; die Meldung selbst zeigt Next in Produktion nicht.
export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error("Seitenfehler:", error);
  }, [error]);

  return (
    <Card role="alert" className="items-center py-8 text-center">
      <p className="font-medium text-destructive">Diese Seite konnte nicht geladen werden.</p>
      <p className="text-sm text-muted-foreground">
        Bitte gleich noch einmal versuchen.
        {error.digest && (
          <>
            {" "}
            Fehlerkennung: <span className="font-mono">{error.digest}</span>
          </>
        )}
      </p>
      <Button variant="outline" onClick={() => retry()}>
        <RotateCw />
        Erneut versuchen
      </Button>
    </Card>
  );
}
