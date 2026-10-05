// @vitest-environment node
import { describe, it, expect } from "vitest";
import { buildNachweis } from "../nachweis";
import { sampleUserData } from "./helpers/user-data-fixture";
import { newGroupSessionId } from "@/types";
import { resolveRegelwerk, standardRegelwerk } from "../ausbildungsregeln/resolve";
import { KEINE_ABWEICHUNGEN } from "../ausbildungsregeln/model";

const STANDARD = standardRegelwerk();

const Q1 = { from: "2026-01-01", to: "2026-03-31", supervisorId: null };
const NOW = new Date("2026-09-26T10:00:00.000Z");

describe("buildNachweis ohne Supervisor:in", () => {
  it("listet Sitzungen, Supervisionen und durchgeführte Doppelstunden im Zeitraum, Grenzen inklusive", () => {
    const n = buildNachweis(sampleUserData(), Q1, STANDARD, NOW);
    expect(n.therapySessions.map((r) => r.id)).toEqual(["t-1", "t-2", "t-3"]);
    expect(n.supervisionSessions.map((r) => r.id)).toEqual(["sv-1", "sv-2"]);
    expect(n.groupSessions.map((r) => r.id)).toEqual(["gs-1"]);
    expect(n.supervisor).toBeNull();
    expect(n.period).toEqual({ from: "2026-01-01", to: "2026-03-31" });
    expect(n.pia).toEqual({ name: "PiA A", email: "a@example.com" });
    expect(n.generatedAt).toBe("2026-09-26T10:00:00.000Z");
  });

  it("zeigt je Sitzung Chiffre, Kategorie und die Supervision, in der sie besprochen wurde", () => {
    const n = buildNachweis(sampleUserData(), Q1, STANDARD, NOW);
    expect(n.therapySessions[0]).toEqual({
      id: "t-1",
      date: "2026-01-10",
      chiffre: "A-01",
      category: "probatorik",
      durationMinutes: 50,
      supervisions: [{ id: "sv-1", date: "2026-02-20", supervisorName: "Supervision Eins" }],
    });
  });

  it("zeigt je Supervision die besprochenen Sitzungen sortiert nach Datum", () => {
    const n = buildNachweis(sampleUserData(), Q1, STANDARD, NOW);
    expect(n.supervisionSessions[0]).toEqual({
      id: "sv-1",
      date: "2026-02-20",
      supervisorName: "Supervision Eins",
      kind: "individual",
      setting: "einzel",
      durationMinutes: 60,
      linkedTherapySessions: [
        { date: "2026-01-10", chiffre: "A-01" },
        { date: "2026-02-14", chiffre: "A-02" },
      ],
      linkedGroupSessions: [],
    });
  });

  it("summiert Anzahl, Minuten, Einheiten à 50 Min je Kategorie und das Verhältnis", () => {
    const { totals } = buildNachweis(sampleUserData(), Q1, STANDARD, NOW);
    expect(totals).toMatchObject({
      therapyUnits: 3,
      therapyMinutes: 160,
      therapyHours: 3.2, // 160 Min ÷ 50
      hoursByCategory: { sprechstunde: 0, probatorik: 1, behandlung: 1.2, bezugsperson: 1, gespraechsziffer: 0 },
      supervisionUnits: 2,
      supervisionMinutes: 150,
      supervisionHours: 3,
      groupSessionUnits: 1,
      groupSessionMinutes: 100,
      groupSessionHours: 2, // 100 Min ÷ 50 – gesondert gezählt, nicht Teil der Behandlungsstunden
    });
    expect(totals.ratio).toMatchObject({ ratio: 1.1, status: "ok" }); // 3,2 / 3,0 = 1,07
    expect(Object.keys(totals.hoursByCategory)).toEqual(["sprechstunde", "probatorik", "behandlung", "bezugsperson", "gespraechsziffer"]);
  });

  it("liefert leere Listen und ein unendliches Verhältnis, wenn im Zeitraum nichts liegt", () => {
    const n = buildNachweis(sampleUserData(), { from: "2025-01-01", to: "2025-12-31", supervisorId: null }, STANDARD, NOW);
    expect(n.therapySessions).toEqual([]);
    expect(n.supervisionSessions).toEqual([]);
    expect(n.totals.therapyHours).toBe(0);
    expect(n.totals.ratio.ratio).toBe(Infinity);
  });

  it("zeigt unter einer Supervision nur durchgeführte Doppelstunden – wie in Gruppenliste und Summen (#41)", () => {
    const data = sampleUserData();
    // gs-2 ist ausgefallen und wird zusätzlich in sv-3 (April) besprochen.
    data.supervisionSessions[2].linkedGroupSessionIds.push(newGroupSessionId("gs-2"));
    const april = { from: "2026-04-01", to: "2026-04-30" };

    const alle = buildNachweis(data, { ...april, supervisorId: null }, STANDARD, NOW);
    expect(alle.supervisionSessions[0].linkedGroupSessions).toEqual([{ date: "2026-01-12", groupName: "Gruppe Montag" }]);
    expect(alle.groupSessions.map((r) => r.id)).toEqual(["gs-3"]);

    const eins = buildNachweis(data, { ...april, supervisorId: "s-1" }, STANDARD, NOW);
    expect(eins.supervisionSessions[0].linkedGroupSessions.map((g) => g.date)).toEqual(eins.groupSessions.map((g) => g.date));
    expect(eins.totals.groupSessionUnits).toBe(1);
  });

  it("sortiert Sitzungen gleichen Datums natürlich nach Chiffre: A-2 vor A-10", () => {
    const data = sampleUserData();
    data.patients[0].chiffre = "A-10";
    data.patients[1].chiffre = "A-2";
    data.therapySessions[1].date = "2026-01-10"; // t-2 (A-2) am selben Tag wie t-1 (A-10)
    const n = buildNachweis(data, Q1, STANDARD, NOW);
    expect(n.therapySessions.map((r) => r.id)).toEqual(["t-2", "t-1", "t-3"]);
    expect(n.supervisionSessions[0].linkedTherapySessions.map((t) => t.chiffre)).toEqual(["A-2", "A-10"]);
  });

  it("nimmt Einträge genau am ersten und am letzten Tag auf, den Tag davor und danach nicht", () => {
    const data = sampleUserData();
    const period = { from: "2026-02-01", to: "2026-02-28", supervisorId: null };
    data.therapySessions[0].date = "2026-01-31"; // t-1: Tag davor
    data.therapySessions[1].date = "2026-02-01"; // t-2: erster Tag
    data.therapySessions[2].date = "2026-02-28"; // t-3: letzter Tag
    data.therapySessions[3].date = "2026-03-01"; // t-4: Tag danach
    data.supervisionSessions[0].date = "2026-02-01"; // sv-1
    data.supervisionSessions[1].date = "2026-02-28"; // sv-2
    data.supervisionSessions[2].date = "2026-03-01"; // sv-3
    data.groupSessions[0].date = "2026-01-31"; // gs-1 (durchgeführt): davor
    data.groupSessions[2].date = "2026-02-28"; // gs-3 (durchgeführt): letzter Tag
    const n = buildNachweis(data, period, STANDARD, NOW);
    expect(n.therapySessions.map((r) => r.id)).toEqual(["t-2", "t-3"]);
    expect(n.supervisionSessions.map((r) => r.id)).toEqual(["sv-1", "sv-2"]);
    expect(n.groupSessions.map((r) => r.id)).toEqual(["gs-3"]);
    expect(n.totals.therapyUnits).toBe(2);
  });
});

describe("buildNachweis für eine Supervisor:in", () => {
  it("listet nur deren Supervisionen im Zeitraum und genau die dort besprochenen Sitzungen", () => {
    const n = buildNachweis(sampleUserData(), { ...Q1, supervisorId: "s-1" }, STANDARD, NOW);
    expect(n.supervisor).toEqual({ id: "s-1", name: "Supervision Eins" });
    expect(n.supervisionSessions.map((r) => r.id)).toEqual(["sv-1"]);
    // t-3 liegt im Zeitraum, wurde aber bei Supervision Zwei besprochen
    expect(n.therapySessions.map((r) => r.id)).toEqual(["t-1", "t-2"]);
    expect(n.groupSessions).toEqual([]);
  });

  it("nimmt besprochene Sitzungen auch dann auf, wenn ihr eigenes Datum außerhalb des Zeitraums liegt", () => {
    const n = buildNachweis(sampleUserData(), { from: "2026-04-01", to: "2026-04-30", supervisorId: "s-1" }, STANDARD, NOW);
    expect(n.supervisionSessions.map((r) => r.id)).toEqual(["sv-3"]);
    expect(n.groupSessions.map((r) => r.id)).toEqual(["gs-1"]); // Januar, besprochen im April
    expect(n.groupSessions[0].supervisions).toEqual([{ id: "sv-3", date: "2026-04-05", supervisorName: "Supervision Eins" }]);
    expect(n.therapySessions).toEqual([]);
  });

  it("wirft NotFoundError für eine unbekannte Supervisor:in", () => {
    expect(() => buildNachweis(sampleUserData(), { ...Q1, supervisorId: "s-fremd" }, STANDARD, NOW)).toThrow(
      "Supervisor:in nicht gefunden"
    );
  });
});

describe("buildNachweis mit Regelwerk (#8)", () => {
  it("übernimmt die wirksamen Regeln und die persönlich festgelegten Felder", () => {
    const regelwerk = resolveRegelwerk({
      instanz: null,
      abweichungen: { ...KEINE_ABWEICHUNGEN, behandlungsstundenZiel: 500, verhaeltnisWarnung: 3, verhaeltnisKritisch: 3.5 },
      ebmStaffeln: [],
    });
    const n = buildNachweis(sampleUserData(), Q1, regelwerk, NOW);
    expect(n.regeln).toEqual(regelwerk.regeln);
    expect(n.abweichend).toEqual(["behandlungsstundenZiel", "verhaeltnisWarnung", "verhaeltnisKritisch"]);
    expect(n.totals.ratio.soll).toBe(3);
    expect(buildNachweis(sampleUserData(), Q1, STANDARD, NOW).abweichend).toEqual([]);
  });
});
