import Link from "next/link";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatDecimal } from "@/lib/csv";
import { formatDateDe } from "@/lib/dates";
import { countNoun, formatCents, formatEuro } from "@/lib/format";
import { forecastDisplay, type ForecastDisplay, type QuarterForecast } from "@/lib/quarter-forecast";
import { ForecastAssumption } from "./ForecastAssumption";

interface QuarterForecastCardProps {
  forecast: QuarterForecast;
  incomePerHour: number;
}

const sitzungen = (n: number) => countNoun(n, "Sitzung", "Sitzungen");
// Rest-Sitzungen aus den Anzeigewerten (Zehntel): „1,7 Sitzungen“, ganze Zahlen „3 Sitzungen“/„1 Sitzung“. Ein exakter
// Rest über 0, der gerundet 0,0 wäre, heißt „weniger als 0,1 Sitzungen“ – sonst stünde „0 Sitzungen ≈ 3 EUR“ (#53).
function sitzungenGenau(shown: number, exact: number): string {
  if (shown === 0 && exact > 0) return "weniger als 0,1 Sitzungen";
  return Number.isInteger(shown) ? sitzungen(shown) : `${formatDecimal(shown, 1)} Sitzungen`;
}

// Rest-Sitzungen in Worten. Schon eingetragene künftige Sitzungen stecken in „bisher“ und werden von den geplanten
// abgezogen (quarterForecast); die Karte zeigt den Abzug – der Zweig entscheidet am exakten Rest, nicht an Zehnteln.
function remainingSessionsText(d: ForecastDisplay, remaining: QuarterForecast["remaining"]): string {
  const rest = sitzungenGenau(d.sessions, remaining.sessions);
  if (remaining.alreadyEntered === 0) return rest;
  const planned = sitzungenGenau(d.plannedSessions, remaining.plannedSessions);
  if (remaining.sessions > 0) return `${planned}, abzüglich ${remaining.alreadyEntered} bereits eingetragener = ${rest}`;
  const verb = remaining.alreadyEntered === 1 ? "ist" : "sind";
  return `${planned}; ${remaining.alreadyEntered} ${verb} bereits eingetragen, es bleiben ${rest}`;
}

// „Wie viel Geld bekomme ich am Quartalsende?“ – bisher wie die Quartalsübersicht in Finanzen, dazu die exakte Prognose
// mit offengelegter Rechnung. Die Faktoren stehen gerundet da; geht eine Gleichung gerundet nicht auf, steht „≈“ statt
// „=“ und ein Satz erklärt das (#51). Ohne Honorarsatz gibt es keine Beträge, nur den Hinweis.
export function QuarterForecastCard({ forecast, incomePerHour }: QuarterForecastCardProps) {
  const { quarter, period, soFar, lookback, planned, remaining } = forecast;
  const d = forecastDisplay(forecast);
  const approx = d.sessionsSign === "≈" || d.incomeSign === "≈" || d.totalSign === "≈";
  const link = "font-medium text-primary hover:underline";

  return (
    <Card role="region" aria-label={`Honorar ${quarter}`} className="md:col-span-2">
      <SectionHeader>Honorar {quarter}</SectionHeader>
      {incomePerHour > 0 ? (
        <>
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <p className="text-xs text-muted-foreground">Prognose zum Quartalsende ({formatDateDe(period.to)})</p>
              <p className="text-3xl font-bold wrap-anywhere text-primary">{formatEuro(d.forecastProfit)}</p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>
                Bisher <span className="font-semibold text-foreground">{formatEuro(d.soFarProfit)}</span> aus {sitzungen(soFar.sessions)}
              </p>
              <p>
                Einnahmen {formatEuro(soFar.income)} − Supervision {formatEuro(soFar.costs)}
              </p>
            </div>
          </div>
          <ForecastAssumption>
            <p>
              {planned.source === "einstellung" ? "Geplant" : `Schnitt der letzten ${lookback.weeks} Wochen`}:{" "}
              {formatDecimal(d.perWeek, 1)} Sitzungen pro Woche × {formatDecimal(d.weeks, 1)} verbleibende Wochen {d.sessionsSign}{" "}
              {remainingSessionsText(d, remaining)} × {formatCents(d.incomePerSession)} EUR je Sitzung {d.incomeSign}{" "}
              {formatEuro(d.income)}.
            </p>
            <p>
              Ergebnis bisher {formatEuro(d.soFarProfit)} + {formatEuro(d.income)} {d.totalSign} {formatEuro(d.forecastProfit)}.
            </p>
            {approx && <p>„≈“ bedeutet: Die Faktoren sind zur Anzeige gerundet, gerechnet wird mit den ungerundeten Werten.</p>}
            <p>
              Honorar je Sitzung ist der Durchschnitt der letzten {lookback.weeks} Wochen ({sitzungen(lookback.sessions)}).
              Einnahmen bisher: Behandlungsstunden (à 50 Min) × Honorarsatz plus Gruppen-Honorar durchgeführter Doppelstunden –
              wie die Quartalsübersicht in Finanzen. Künftige Supervisionskosten und Doppelstunden sind nicht eingerechnet.
            </p>
            <Link href="/finances" className={link}>
              Geplante Sitzungen pro Woche in Finanzen anpassen
            </Link>
          </ForecastAssumption>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          {sitzungen(soFar.sessions)} im Quartal. Für Honorar und Prognose fehlt der Honorarsatz je Behandlungsstunde –{" "}
          <Link href="/finances" className={link}>
            in Finanzen eintragen
          </Link>
          .
        </p>
      )}
    </Card>
  );
}
