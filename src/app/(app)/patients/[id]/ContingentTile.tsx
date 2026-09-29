import { Card } from "@/components/ui/card";
import { formatDecimal } from "@/lib/csv";
import { cn } from "@/lib/utils";

// Antrags-Kontingent (#53): „–“ ohne Antrag, sonst der Rest in Behandlungsstunden; eine Überziehung ab 0,05 Stunden
// (eine Minute = 0,02 wäre „0,0“) steht rot als „über dem Antrag“ statt als negatives „übrig“.
// wrap-anywhere: lange Zahlen brechen in der Kachel um statt die Seite zu verbreitern.
export function ContingentTile({ remaining }: { remaining: number | null }) {
  const over = remaining !== null && remaining <= -0.05;
  return (
    <Card className="text-center">
      <p className={cn("text-2xl font-bold wrap-anywhere", over ? "text-destructive" : "text-foreground")}>
        {remaining === null ? "–" : formatDecimal(Math.abs(remaining), 1)}
      </p>
      <p className="text-xs text-muted-foreground">
        {over ? "Behandlungsstunden über dem Antrag" : "Behandlungsstunden übrig (Antrag)"}
      </p>
    </Card>
  );
}
