import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactElement } from "react";
import { render, fireEvent, screen, within } from "@testing-library/react";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn(), trackFailure: vi.fn() }));
vi.mock("../../app/(app)/groups/[id]/actions", () => ({
  addGroupSession: vi.fn(),
  updateGroupSession: vi.fn(),
  deleteGroupSession: vi.fn(),
  addGroupSupervisionSession: vi.fn(),
}));
vi.mock("../../app/(app)/finances/actions", () => ({ saveFinancialSettings: vi.fn() }));

import { TherapyHoursCard } from "../dashboard/TherapyHoursCard";
import { SupervisionStatusCard } from "../dashboard/SupervisionStatusCard";
import { QuarterForecastCard } from "../dashboard/QuarterForecastCard";
import RatioIndicator from "../RatioIndicator";
import { NachweisDocument } from "../nachweis/NachweisDocument";
import { GroupDetailClient } from "../../app/(app)/groups/[id]/GroupDetailClient";
import { FinancesClient } from "../../app/(app)/finances/FinancesClient";
import { calculateQuarterlyFinancesWithGroups, calculateRatio, financeTotals } from "../../lib/calculations";
import { buildNachweis, type NachweisFilter } from "../../lib/nachweis";
import { quarterForecast } from "../../lib/quarter-forecast";
import type { UserData } from "../../lib/db/user-data";
import type { FinancialSettings, SessionCategory } from "@/types";
import { sampleUserData } from "../../lib/__tests__/helpers/user-data-fixture";
import { standardRegelwerk } from "../../lib/ausbildungsregeln/resolve";
import { vorherNachherDaten, VN_HEUTE, VN_JETZT, VN_ZEITRAUM } from "../../lib/__tests__/helpers/vorher-nachher";

const SNAPSHOT = "./__snapshots__/vorher-nachher-render.json";

// Ab #8: Regeln aus dem Regelwerk. Nur dieser Block ändert sich mit der Umstellung, der Snapshot nie.
const regelwerk = standardRegelwerk();
const R = regelwerk.regeln;
const ui = {
  therapieKarte: (hours: number, categoryHours: Record<SessionCategory, number>) => (
    <TherapyHoursCard hours={hours} target={R.behandlungsstundenZiel} categoryHours={categoryHours} />
  ),
  supervisionKarte: (therapyHours: number, supervisionHours: number, unsupervisedCount: number) => (
    <SupervisionStatusCard
      therapyHours={therapyHours}
      supervisionHours={supervisionHours}
      ratio={calculateRatio(therapyHours, supervisionHours, R)}
      regeln={R}
      unsupervisedCount={unsupervisedCount}
      // Aufteilung nach Setting kam nach der Umstellung dazu – hier alles Einzel.
      bySetting={{ einzel: supervisionHours, gruppe: 0 }}
    />
  ),
  verhaeltnis: (therapyHours: number, supervisionHours: number, compact: boolean) => (
    <RatioIndicator ratio={calculateRatio(therapyHours, supervisionHours, R)} compact={compact} />
  ),
  nachweis: (data: UserData, filter: NachweisFilter, now: Date) => (
    <NachweisDocument nachweis={buildNachweis(data, filter, regelwerk, now)} />
  ),
  gruppe: (data: UserData) => (
    <GroupDetailClient
      initialGroup={data.groups[0]}
      initialGroupSessions={data.groupSessions}
      initialSupervisionSessions={data.supervisionSessions.filter((s) => s.kind === "group")}
      initialSupervisedGroupSessionIds={data.supervisionSessions.flatMap((s) => s.linkedGroupSessionIds)}
      initialSupervisors={data.supervisors}
      regelwerk={regelwerk}
    />
  ),
  prognose: (data: UserData, settings: FinancialSettings, today: string) => (
    <QuarterForecastCard
      forecast={quarterForecast({
        therapySessions: data.therapySessions,
        supervisionSessions: data.supervisionSessions,
        groupSessions: data.groupSessions,
        settings,
        today,
        ebmStaffeln: regelwerk.ebmStaffeln,
      })}
      incomePerHour={settings.incomePerHour}
    />
  ),
  // Dieselben Funktionen wie loadFinancesData in finances/actions.ts.
  finanzen: (data: UserData, settings: FinancialSettings) => {
    const { totalIncome, totalCosts } = financeTotals(
      data.therapySessions,
      data.supervisionSessions,
      data.groupSessions,
      settings.incomePerHour,
      settings.supervisionCosts,
      regelwerk.ebmStaffeln
    );
    return (
      <FinancesClient
        initialSettings={settings}
        initialSupervisors={data.supervisors}
        initialQuarters={calculateQuarterlyFinancesWithGroups(
          data.therapySessions,
          data.supervisionSessions,
          data.groupSessions,
          settings.incomePerHour,
          settings.supervisionCosts,
          regelwerk.ebmStaffeln
        )}
        initialTotalIncome={totalIncome}
        initialTotalCosts={totalCosts}
        // Ausgaben-Export (#65) kam nach der Umstellung dazu – ohne Jahre bleibt die Karte weg, der Stand wie vorher.
        expenseYears={[]}
      />
    );
  },
};

// Sichtbarer Text ohne <style>-Inhalte: reine CSS-Änderungen sollen den eingefrorenen Snapshot nicht brechen.
function sichtbar(container: HTMLElement): string {
  const kopie = container.cloneNode(true) as HTMLElement;
  kopie.querySelectorAll("style").forEach((el) => el.remove());
  return kopie.textContent ?? "";
}

function text(element: ReactElement): string {
  const { container, unmount } = render(element);
  const content = sichtbar(container);
  unmount();
  return content;
}

// Gruppenseite: Seite, geöffnetes Doppelstunden-Formular (Ambulanzzeit-Hinweis, Honorar-Vorschau) und die Vorschau je Kinderzahl.
function gruppeTexte(element: ReactElement) {
  const { container, unmount } = render(element);
  const seite = sichtbar(container);
  fireEvent.click(screen.getAllByRole("button", { name: "Neu" })[0]);
  const mitFormular = sichtbar(container);
  const kinderFeld = screen.getByLabelText("Anwesende Kinder");
  const honorarVorschau = [0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map((kinder) => {
    fireEvent.change(kinderFeld, { target: { value: String(kinder) } });
    return { kinder, vorschau: within(container).queryByText(/Honorar-Anteil/)?.textContent ?? null };
  });
  unmount();
  return { seite, mitFormular, honorarVorschau };
}

const Q1: NachweisFilter = { from: "2026-01-01", to: "2026-03-31", supervisorId: null };
const NOW = new Date("2026-09-26T12:00:00.000Z");

// Die Radix-Checkbox der Gruppenseite misst sich per ResizeObserver, den jsdom nicht mitbringt.
beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("Vorher = Nachher (#8): sichtbare Texte", () => {
  it("zeigt Karten, Verhältnis, Nachweis, Gruppe, Prognose und Finanzen wie vor der Umstellung", async () => {
    const { data, settings } = vorherNachherDaten();
    const supervisionFaelle: [number, number, number][] = [
      [40, 5, 7],
      [40, 10, 1],
      [0, 0, 0],
      [10, 2.46, 0],
      [160, 40, 3],
    ];
    const verhaeltnisFaelle: [number, number][] = [
      [40, 10],
      [45, 10],
      [60, 10],
      [10, 0],
    ];
    const ausgabe = {
      therapie: [
        text(ui.therapieKarte(412.33, { sprechstunde: 0, probatorik: 20, behandlung: 380.33, bezugsperson: 12, gespraechsziffer: 0 })),
        text(ui.therapieKarte(612, { sprechstunde: 0, probatorik: 0, behandlung: 612, bezugsperson: 0, gespraechsziffer: 0 })),
      ],
      supervision: supervisionFaelle.map(([a, b, u]) => text(ui.supervisionKarte(a, b, u))),
      verhaeltnis: verhaeltnisFaelle.flatMap(([a, b]) => [text(ui.verhaeltnis(a, b, false)), text(ui.verhaeltnis(a, b, true))]),
      nachweis: [
        text(ui.nachweis(sampleUserData(), Q1, NOW)),
        text(ui.nachweis(data, VN_ZEITRAUM, VN_JETZT)),
        text(ui.nachweis(data, { ...VN_ZEITRAUM, supervisorId: "s-1" }, VN_JETZT)),
      ],
      gruppe: gruppeTexte(ui.gruppe(data)),
      prognose: text(ui.prognose(data, settings, VN_HEUTE)),
      finanzen: text(ui.finanzen(data, settings)),
    };
    await expect(`${JSON.stringify(ausgabe, null, 2)}\n`).toMatchFileSnapshot(SNAPSHOT);
  });
});
