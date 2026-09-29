import { Card } from "@/components/ui/card";
import { formatDecimal } from "@/lib/csv";
import type { Kontingent } from "@/lib/kontingente";
import { cn } from "@/lib/utils";

// Fall-Kontingent (#66): „übrig x von y“, überzogen rot als „über dem Kontingent“ – erst ab 0,05, damit „0,0“ nie rot
// steht (Schwelle = Anzeige-Rundung, wie ContingentTile). Eine Nachkommastelle nur bei Bruchteilen (freie Dauer außerhalb
// des Rasters). wrap-anywhere wie ContingentTile; der Klammerteil „(x von y)“ bricht nicht um.
export function KontingentTile({ titel, einheit, kontingent }: { titel: string; einheit: string; kontingent: Kontingent }) {
  const rest = kontingent.verfuegbar - kontingent.genutzt;
  const over = rest <= -0.05;
  const zahl = (v: number) => (Number.isInteger(v) ? String(v) : formatDecimal(v, 1));
  return (
    <Card className="text-center">
      <p className={cn("text-2xl font-bold wrap-anywhere", over ? "text-destructive" : "text-foreground")}>{zahl(Math.abs(rest))}</p>
      <p className="text-xs text-muted-foreground">
        {over ? `${einheit} über dem Kontingent` : `${einheit} übrig`} · {titel}{" "}
        <span className="whitespace-nowrap">
          ({zahl(kontingent.genutzt)} von {kontingent.verfuegbar})
        </span>
      </p>
    </Card>
  );
}
