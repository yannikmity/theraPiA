import { FlaskConical } from "lucide-react";

// Demo-Accounts (#9): dauerhaft sichtbar oben im Inhalt jeder Seite hinter dem Login, damit niemand echte Daten in
// einen Account mit fiktiven Beispieldaten einträgt. Bleibt im Druck sichtbar (schlicht, ohne Farbfläche): ein
// gedruckter Nachweis aus einem Demo-Account soll als solcher erkennbar sein.
export function DemoHinweis() {
  return (
    <div
      role="note"
      aria-label="Demo-Account"
      className="mb-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-sm text-warning print:border-foreground print:bg-transparent print:text-foreground"
    >
      <FlaskConical size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-medium">Demo-Account:</span> Alle Daten hier sind fiktive Beispieldaten. Bitte keine
        echten Daten erfassen.
      </p>
    </div>
  );
}
