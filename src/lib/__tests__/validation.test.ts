import { describe, it, expect } from "vitest";
import {
  addPatientSchema,
  updatePatientSchema,
  addTherapySessionSchema,
  addTherapySessionsSchema,
  updateTherapySessionSchema,
  deleteTherapySessionSchema,
  addSupervisionSessionSchema,
  updateSupervisionSessionSchema,
  addGroupSessionSchema,
  updateGroupSessionSchema,
  addGroupSupervisionSessionSchema,
  deleteByIdSchema,
  deleteGroupSessionSchema,
  updateFinancialSettingsSchema,
  registerSchema,
  resetPasswordSchema,
  changePasswordSchema,
  createInvitationSchema,
  nachweisFilterSchema,
  deleteAccountSchema,
} from "../validation";

describe("addPatientSchema", () => {
  it("accepts valid input", () => {
    const result = addPatientSchema.safeParse({
      chiffre: "KL-2024-042",
      therapyType: "langzeittherapie",
      startDate: "2024-01-15",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty chiffre", () => {
    const result = addPatientSchema.safeParse({
      chiffre: "",
      therapyType: "langzeittherapie",
      startDate: "2024-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid therapy type", () => {
    const result = addPatientSchema.safeParse({
      chiffre: "TEST",
      therapyType: "invalid",
      startDate: "2024-01-15",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", () => {
    const result = addPatientSchema.safeParse({
      chiffre: "TEST",
      therapyType: "kurzzeittherapie",
      startDate: "15.01.2024",
    });
    expect(result.success).toBe(false);
  });
});

describe("updatePatientSchema", () => {
  it("accepts valid input with null endDate", () => {
    const result = updatePatientSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      chiffre: "KL-2024-042",
      therapyType: "langzeittherapie",
      startDate: "2024-01-15",
      endDate: null,
      isActive: true,
      antragsdatum: null,
      beantragteStunden: null,
      genehmigungsdatum: null,
      sprechstundenAmbulanz: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid input with endDate and antrag", () => {
    const result = updatePatientSchema.safeParse({
      id: "550e8400-e29b-41d4-a716-446655440000",
      chiffre: "KL-2024-042",
      therapyType: "kurzzeittherapie",
      startDate: "2024-01-15",
      endDate: "2024-06-15",
      isActive: false,
      antragsdatum: "2024-03-01",
      beantragteStunden: 60,
      genehmigungsdatum: "2024-04-01",
      sprechstundenAmbulanz: 3,
    });
    expect(result.success).toBe(true);
  });

  // Genehmigung und Ambulanz-Sprechstunden (#66)
  const basis = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    chiffre: "KL-2024-042",
    therapyType: "langzeittherapie",
    startDate: "2024-01-15",
    endDate: null,
    isActive: true,
    antragsdatum: "2024-03-01",
    beantragteStunden: 60,
    genehmigungsdatum: null,
    sprechstundenAmbulanz: 0,
  };

  it("lehnt eine Genehmigung vor dem Antrag ab, mit Fehler am Genehmigungsdatum", () => {
    const result = updatePatientSchema.safeParse({ ...basis, genehmigungsdatum: "2024-02-28" });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ["genehmigungsdatum"], message: "Die Genehmigung kann nicht vor dem Antrag liegen" }),
    ]);
  });

  it("nimmt eine Genehmigung am Tag des Antrags an", () => {
    expect(updatePatientSchema.safeParse({ ...basis, genehmigungsdatum: "2024-03-01" }).success).toBe(true);
  });

  it("nimmt eine Genehmigung ohne Antragsdatum an", () => {
    const result = updatePatientSchema.safeParse({ ...basis, antragsdatum: null, genehmigungsdatum: "2024-02-28" });
    expect(result.success).toBe(true);
  });

  it("begrenzt die Ambulanz-Sprechstunden auf 0–10", () => {
    expect(updatePatientSchema.safeParse({ ...basis, sprechstundenAmbulanz: 10 }).success).toBe(true);
    expect(updatePatientSchema.safeParse({ ...basis, sprechstundenAmbulanz: 11 }).success).toBe(false);
    expect(updatePatientSchema.safeParse({ ...basis, sprechstundenAmbulanz: -1 }).success).toBe(false);
  });

  const meldungen = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
    r.success ? [] : r.error!.issues.map((i) => i.message);

  it.each([
    [11, "Höchstens 10 Sprechstunden je Fall"],
    [-1, "Mindestens 0"],
    [1.5, "Ganze Zahl eingeben"],
  ])("meldet Ambulanz-Sprechstunden %s auf Deutsch: „%s“", (sprechstundenAmbulanz, meldung) => {
    expect(meldungen(updatePatientSchema.safeParse({ ...basis, sprechstundenAmbulanz }))).toEqual([meldung]);
  });

  it.each([
    [0, "Mindestens 1 Behandlungsstunde"],
    [-5, "Mindestens 1 Behandlungsstunde"],
    [12.5, "Ganze Zahl eingeben"],
  ])("meldet beantragte Stunden %s auf Deutsch: „%s“", (beantragteStunden, meldung) => {
    expect(meldungen(updatePatientSchema.safeParse({ ...basis, beantragteStunden }))).toEqual([meldung]);
  });
});

describe("addTherapySessionSchema", () => {
  it("accepts valid input", () => {
    const result = addTherapySessionSchema.safeParse({
      patientId: "550e8400-e29b-41d4-a716-446655440000",
      date: "2024-06-01",
      durationMinutes: 50,
      notes: "Some notes",
    });
    expect(result.success).toBe(true);
  });

  it("rejects 0 duration", () => {
    const result = addTherapySessionSchema.safeParse({
      patientId: "550e8400-e29b-41d4-a716-446655440000",
      date: "2024-06-01",
      durationMinutes: 0,
      notes: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects duration over 480", () => {
    const result = addTherapySessionSchema.safeParse({
      patientId: "550e8400-e29b-41d4-a716-446655440000",
      date: "2024-06-01",
      durationMinutes: 500,
      notes: "",
    });
    expect(result.success).toBe(false);
  });

  it("defaults notes to empty string", () => {
    const result = addTherapySessionSchema.safeParse({
      patientId: "550e8400-e29b-41d4-a716-446655440000",
      date: "2024-06-01",
      durationMinutes: 50,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.notes).toBe("");
    }
  });
});

describe("addSupervisionSessionSchema", () => {
  it("accepts valid input", () => {
    const result = addSupervisionSessionSchema.safeParse({
      supervisorId: "550e8400-e29b-41d4-a716-446655440000",
      date: "2024-06-01",
      durationMinutes: 60,
      linkedTherapySessionIds: ["550e8400-e29b-41d4-a716-446655440001"],
    });
    expect(result.success).toBe(true);
  });

  it("defaults linkedTherapySessionIds to empty array", () => {
    const result = addSupervisionSessionSchema.safeParse({
      supervisorId: "550e8400-e29b-41d4-a716-446655440000",
      date: "2024-06-01",
      durationMinutes: 60,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.linkedTherapySessionIds).toEqual([]);
    }
  });

  it("nimmt ohne Angabe das Setting Einzel an und lehnt unbekannte Settings ab", () => {
    const base = { supervisorId: "550e8400-e29b-41d4-a716-446655440000", date: "2024-06-01", durationMinutes: 60 };
    const ohne = addSupervisionSessionSchema.safeParse(base);
    expect(ohne.success && ohne.data.setting).toBe("einzel");
    const gruppe = addSupervisionSessionSchema.safeParse({ ...base, setting: "gruppe" });
    expect(gruppe.success && gruppe.data.setting).toBe("gruppe");
    expect(addSupervisionSessionSchema.safeParse({ ...base, setting: "paar" }).success).toBe(false);
  });
});

describe("updateFinancialSettingsSchema", () => {
  it("accepts valid input", () => {
    const result = updateFinancialSettingsSchema.safeParse({
      incomePerHour: 100,
      supervisionCosts: {
        "550e8400-e29b-41d4-a716-446655440000": 80,
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects negative incomePerHour", () => {
    const result = updateFinancialSettingsSchema.safeParse({
      incomePerHour: -10,
      supervisionCosts: {},
    });
    expect(result.success).toBe(false);
  });

  it("geplante Sitzungen pro Woche: optional (fehlend = unverändert), ganzzahlig 0–60, null = Schnitt", () => {
    const base = { incomePerHour: 85, supervisionCosts: {} };
    const ohne = updateFinancialSettingsSchema.safeParse(base);
    expect(ohne.success).toBe(true);
    if (ohne.success) expect(ohne.data.plannedSessionsPerWeek).toBeUndefined();
    const mitNull = updateFinancialSettingsSchema.safeParse({ ...base, plannedSessionsPerWeek: null });
    if (mitNull.success) expect(mitNull.data.plannedSessionsPerWeek).toBeNull();
    expect(updateFinancialSettingsSchema.safeParse({ ...base, plannedSessionsPerWeek: 6 }).success).toBe(true);
    expect(updateFinancialSettingsSchema.safeParse({ ...base, plannedSessionsPerWeek: 0 }).success).toBe(true);
    expect(updateFinancialSettingsSchema.safeParse({ ...base, plannedSessionsPerWeek: null }).success).toBe(true);
    expect(updateFinancialSettingsSchema.safeParse({ ...base, plannedSessionsPerWeek: 61 }).success).toBe(false);
    expect(updateFinancialSettingsSchema.safeParse({ ...base, plannedSessionsPerWeek: 2.5 }).success).toBe(false);
    expect(updateFinancialSettingsSchema.safeParse({ ...base, plannedSessionsPerWeek: -1 }).success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("trimmt die E-Mail-Adresse vor der Prüfung", () => {
    const result = registerSchema.safeParse({ email: "  pia@example.com ", password: "1234567890", name: "Test" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("pia@example.com");
  });

  it("accepts valid input", () => {
    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "1234567890",
      name: "Test User",
    });
    expect(result.success).toBe(true);
  });

  it("rejects short password", () => {
    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "123456789",
      name: "Test User",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({
      email: "not-an-email",
      password: "1234567890",
      name: "Test User",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = registerSchema.safeParse({
      email: "test@example.com",
      password: "1234567890",
      name: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("verlangt Token und Mindestlänge", () => {
    expect(resetPasswordSchema.safeParse({ token: "abc", password: "1234567890" }).success).toBe(true);
    expect(resetPasswordSchema.safeParse({ token: "", password: "1234567890" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ token: "abc", password: "kurz" }).success).toBe(false);
  });
});

describe("Passwort höchstens 72 Byte (#48)", () => {
  const cases = [
    ["registerSchema", (pw: string) => registerSchema.safeParse({ email: "pia@example.com", password: pw, name: "Test" })],
    ["resetPasswordSchema", (pw: string) => resetPasswordSchema.safeParse({ token: "abc", password: pw })],
    ["changePasswordSchema", (pw: string) => changePasswordSchema.safeParse({ currentPassword: "alt", newPassword: pw })],
  ] as const;

  for (const [name, parse] of cases) {
    it(`${name}: 72 Byte gehen durch, 73 nicht`, () => {
      expect(parse("a".repeat(72)).success).toBe(true);
      const result = parse("a".repeat(73));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.issues[0]?.message).toContain("72 Byte");
    });

    it(`${name}: Umlaute zählen doppelt`, () => {
      // 36 × „ä“ = 72 Byte, ein weiteres Zeichen kippt die Grenze bei nur 37 sichtbaren Zeichen.
      expect(parse("ä".repeat(36)).success).toBe(true);
      expect(parse("ä".repeat(36) + "a").success).toBe(false);
      expect(parse("€".repeat(25)).success).toBe(false);
    });
  }
});

describe("createInvitationSchema", () => {
  it("erlaubt eine Einladung ohne Adressbindung und trimmt eine gebundene Adresse", () => {
    expect(createInvitationSchema.safeParse({ email: null, role: "pia" }).success).toBe(true);
    const result = createInvitationSchema.safeParse({ email: " pia@example.com ", role: "admin" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("pia@example.com");
    expect(createInvitationSchema.safeParse({ email: "kein-mail", role: "pia" }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ email: null, role: "chef" }).success).toBe(false);
  });

  it("setzt „mit Beispieldaten“ standardmäßig auf false und erlaubt es nur für PiA", () => {
    const ohne = createInvitationSchema.safeParse({ email: null, role: "pia" });
    expect(ohne.success && ohne.data.withDemoData).toBe(false);
    const mit = createInvitationSchema.safeParse({ email: null, role: "pia", withDemoData: true });
    expect(mit.success && mit.data.withDemoData).toBe(true);
    const admin = createInvitationSchema.safeParse({ email: null, role: "admin", withDemoData: true });
    expect(admin.success).toBe(false);
    if (!admin.success) {
      expect(admin.error.issues[0]).toMatchObject({ path: ["withDemoData"], message: "Beispieldaten gibt es nur für PiA-Accounts" });
    }
  });
});

const UUID_A = "550e8400-e29b-41d4-a716-446655440000";
const UUID_B = "550e8400-e29b-41d4-a716-446655440001";

describe("updateTherapySessionSchema", () => {
  const base = { patientId: UUID_A, date: "2026-02-10", durationMinutes: 50, notes: "", category: "behandlung" };

  it("akzeptiert eine Sitzung mit id", () => {
    expect(updateTherapySessionSchema.safeParse({ ...base, id: UUID_B }).success).toBe(true);
  });

  it("verlangt eine UUID als id", () => {
    expect(updateTherapySessionSchema.safeParse({ ...base, id: "nicht-uuid" }).success).toBe(false);
    expect(updateTherapySessionSchema.safeParse(base).success).toBe(false);
  });

  it("kennt Sprechstunde und Gesprächsziffer als Kategorien (#66)", () => {
    for (const category of ["sprechstunde", "gespraechsziffer"]) {
      expect(updateTherapySessionSchema.safeParse({ ...base, id: UUID_B, category }).success).toBe(true);
    }
    expect(updateTherapySessionSchema.safeParse({ ...base, id: UUID_B, category: "unbekannt" }).success).toBe(false);
  });
});

describe("updateSupervisionSessionSchema", () => {
  it("verlangt beim Bearbeiten jedes Feld ausdrücklich – keine Defaults", () => {
    const full = {
      id: UUID_B,
      supervisorId: UUID_A,
      date: "2026-02-10",
      durationMinutes: 60,
      kind: "individual",
      setting: "einzel",
      linkedTherapySessionIds: [],
      linkedGroupSessionIds: [],
      caseShares: [],
    };
    expect(updateSupervisionSessionSchema.safeParse(full).success).toBe(true);
    for (const missing of ["id", "kind", "setting", "linkedTherapySessionIds", "linkedGroupSessionIds", "caseShares"] as const) {
      const { [missing]: _weg, ...rest } = full;
      void _weg;
      const result = updateSupervisionSessionSchema.safeParse(rest);
      expect(result.success, `ohne ${missing}`).toBe(false);
      if (!result.success) expect(result.error.issues[0].path).toEqual([missing]);
    }
  });

  it("lehnt Verknüpfungen ab, die nicht zur Art passen", () => {
    const base = { id: UUID_B, supervisorId: UUID_A, date: "2026-02-10", durationMinutes: 60, setting: "einzel", caseShares: [] };
    const einzel = updateSupervisionSessionSchema.safeParse({
      ...base,
      kind: "individual",
      linkedTherapySessionIds: [],
      linkedGroupSessionIds: [UUID_A],
    });
    expect(einzel.success).toBe(false);
    if (!einzel.success) expect(einzel.error.issues[0].path).toEqual(["linkedGroupSessionIds"]);
    const gruppe = addSupervisionSessionSchema.safeParse({
      supervisorId: UUID_A,
      date: "2026-02-10",
      durationMinutes: 60,
      kind: "group",
      linkedTherapySessionIds: [UUID_A],
    });
    expect(gruppe.success).toBe(false);
    if (!gruppe.success) expect(gruppe.error.issues[0].path).toEqual(["linkedTherapySessionIds"]);
    expect(
      updateSupervisionSessionSchema.safeParse({ ...base, kind: "group", linkedTherapySessionIds: [], linkedGroupSessionIds: [UUID_A] }).success
    ).toBe(true);
  });

  it("fasst doppelte Verknüpfungs-IDs zusammen", () => {
    const base = { id: UUID_B, supervisorId: UUID_A, date: "2026-02-10", durationMinutes: 60, setting: "einzel", caseShares: [] };
    const einzel = updateSupervisionSessionSchema.safeParse({
      ...base,
      kind: "individual",
      linkedTherapySessionIds: [UUID_A, UUID_B, UUID_A],
      linkedGroupSessionIds: [],
    });
    expect(einzel.success).toBe(true);
    if (einzel.success) expect(einzel.data.linkedTherapySessionIds).toEqual([UUID_A, UUID_B]);
    const gruppe = updateSupervisionSessionSchema.safeParse({
      ...base,
      kind: "group",
      linkedTherapySessionIds: [],
      linkedGroupSessionIds: [UUID_B, UUID_B],
    });
    expect(gruppe.success).toBe(true);
    if (gruppe.success) expect(gruppe.data.linkedGroupSessionIds).toEqual([UUID_B]);
  });
});

describe("Supervision: Dauer je Patient:in (#40)", () => {
  const base = { supervisorId: UUID_A, date: "2026-02-10", durationMinutes: 60, kind: "individual", setting: "einzel" };
  const UUID_C = "550e8400-e29b-41d4-a716-446655440003";

  it("nimmt Anteile an, deren Summe die Gesamtdauer ist", () => {
    const shares = [
      { patientId: UUID_A, minutes: 35 },
      { patientId: UUID_C, minutes: 25 },
    ];
    const result = addSupervisionSessionSchema.safeParse({ ...base, caseShares: shares });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.caseShares).toEqual(shares);
    const ohne = addSupervisionSessionSchema.safeParse(base);
    expect(ohne.success && ohne.data.caseShares).toEqual([]);
  });

  it("lehnt eine abweichende Summe, doppelte Patient:innen, Anteile von 0 und Anteile bei Gruppensupervision ab", () => {
    const path = (input: object) => {
      const r = addSupervisionSessionSchema.safeParse({ ...base, ...input });
      return r.success ? null : r.error.issues[0].path;
    };
    expect(path({ caseShares: [{ patientId: UUID_A, minutes: 50 }] })).toEqual(["durationMinutes"]);
    expect(path({ caseShares: [{ patientId: UUID_A, minutes: 30 }, { patientId: UUID_A, minutes: 30 }] })).toEqual(["caseShares"]);
    expect(path({ durationMinutes: 60, caseShares: [{ patientId: UUID_A, minutes: 60 }, { patientId: UUID_C, minutes: 0 }] })).toEqual([
      "caseShares",
      1,
      "minutes",
    ]);
    expect(path({ kind: "group", caseShares: [{ patientId: UUID_A, minutes: 60 }] })).toEqual(["caseShares"]);
  });
});

describe("Supervision bearbeiten: Zeit ohne Fall (#40)", () => {
  const base = { id: UUID_B, supervisorId: UUID_A, date: "2026-02-10", kind: "individual", setting: "einzel", linkedTherapySessionIds: [], linkedGroupSessionIds: [] };

  it("erlaubt eine Gesamtdauer über der Summe der Anteile, aber keine darunter", () => {
    const caseShares = [{ patientId: UUID_A, minutes: 25 }];
    expect(updateSupervisionSessionSchema.safeParse({ ...base, durationMinutes: 50, caseShares }).success).toBe(true);
    const zuKurz = updateSupervisionSessionSchema.safeParse({ ...base, durationMinutes: 20, caseShares });
    expect(zuKurz.success).toBe(false);
    if (!zuKurz.success) expect(zuKurz.error.issues[0].path).toEqual(["durationMinutes"]);
  });
});

describe("Bearbeiten-Schemas ohne Defaults", () => {
  it("updateTherapySessionSchema verlangt notes und category", () => {
    const base = { id: UUID_B, patientId: UUID_A, date: "2026-02-10", durationMinutes: 50 };
    expect(updateTherapySessionSchema.safeParse({ ...base, notes: "", category: "behandlung" }).success).toBe(true);
    expect(updateTherapySessionSchema.safeParse({ ...base, category: "behandlung" }).success).toBe(false);
    expect(updateTherapySessionSchema.safeParse({ ...base, notes: "" }).success).toBe(false);
  });

  it("updateGroupSessionSchema verlangt Ambulanzzeit-Flag, Dauer und Notiz", () => {
    const base = { id: UUID_B, groupId: UUID_A, date: "2026-02-10", status: "durchgefuehrt", childCount: 5 };
    const full = { ...base, countsTowardAmbulanzzeit: true, durationMinutes: 100, notes: "" };
    expect(updateGroupSessionSchema.safeParse(full).success).toBe(true);
    for (const missing of ["countsTowardAmbulanzzeit", "durationMinutes", "notes"] as const) {
      const { [missing]: _weg, ...rest } = full;
      void _weg;
      expect(updateGroupSessionSchema.safeParse(rest).success, `ohne ${missing}`).toBe(false);
    }
  });

  it("addGroupSupervisionSessionSchema ist immer eine Gruppensupervision", () => {
    const result = addGroupSupervisionSessionSchema.safeParse({
      groupId: UUID_A,
      supervisorId: UUID_A,
      date: "2026-02-10",
      durationMinutes: 60,
      linkedGroupSessionIds: [UUID_B],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.kind).toBe("group");
    expect(
      addGroupSupervisionSessionSchema.safeParse({ groupId: UUID_A, supervisorId: UUID_A, date: "2026-02-10", durationMinutes: 60, kind: "individual" }).success
    ).toBe(false);
    const mitTherapie = addGroupSupervisionSessionSchema.safeParse({
      groupId: UUID_A,
      supervisorId: UUID_A,
      date: "2026-02-10",
      durationMinutes: 60,
      linkedTherapySessionIds: [UUID_B],
    });
    expect(mitTherapie.success).toBe(false);
    if (!mitTherapie.success) expect(mitTherapie.error.issues[0].path).toEqual(["linkedTherapySessionIds"]);
  });
});

describe("Lösch-Schemas", () => {
  it("akzeptieren nur UUIDs und verlangen die Kontext-ID zum Nachladen", () => {
    expect(deleteByIdSchema.safeParse({ id: UUID_A }).success).toBe(true);
    expect(deleteByIdSchema.safeParse({ id: "1" }).success).toBe(false);
    expect(deleteTherapySessionSchema.safeParse({ id: UUID_A, patientId: UUID_B }).success).toBe(true);
    expect(deleteTherapySessionSchema.safeParse({ id: UUID_A }).success).toBe(false);
    expect(deleteGroupSessionSchema.safeParse({ id: UUID_A, groupId: UUID_B }).success).toBe(true);
    expect(deleteGroupSessionSchema.safeParse({ id: UUID_A }).success).toBe(false);
  });
});

describe("nachweisFilterSchema", () => {
  it("akzeptiert einen Zeitraum, supervisorId ist optional", () => {
    const result = nachweisFilterSchema.safeParse({ from: "2026-01-01", to: "2026-03-31" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({ from: "2026-01-01", to: "2026-03-31", supervisorId: null });
  });

  it("lehnt einen Zeitraum ab, dessen Ende vor dem Anfang liegt", () => {
    const result = nachweisFilterSchema.safeParse({ from: "2026-03-31", to: "2026-01-01", supervisorId: null });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["to"]);
  });
});

describe("deleteAccountSchema", () => {
  it("verlangt ein Passwort", () => {
    expect(deleteAccountSchema.safeParse({ password: "" }).success).toBe(false);
    expect(deleteAccountSchema.safeParse({}).success).toBe(false);
    expect(deleteAccountSchema.safeParse({ password: "x" }).success).toBe(true);
  });
});

describe("addTherapySessionsSchema", () => {
  const row = { patientId: "550e8400-e29b-41d4-a716-446655440000", date: "2026-09-21", durationMinutes: 50 };

  it("prüft jede Zeile wie eine einzelne Sitzung und setzt deren Vorgaben", () => {
    const result = addTherapySessionsSchema.safeParse({ sessions: [row] });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.sessions[0]).toEqual({ ...row, notes: "", category: "behandlung" });
    expect(addTherapySessionsSchema.safeParse({ sessions: [{ ...row, durationMinutes: 0 }] }).success).toBe(false);
  });

  it("verlangt mindestens eine und höchstens 50 Sitzungen", () => {
    expect(addTherapySessionsSchema.safeParse({ sessions: [] }).success).toBe(false);
    expect(addTherapySessionsSchema.safeParse({ sessions: Array.from({ length: 50 }, () => row) }).success).toBe(true);
    expect(addTherapySessionsSchema.safeParse({ sessions: Array.from({ length: 51 }, () => row) }).success).toBe(false);
  });
});

describe("deutsche Meldungen für Dauer und Datum (#57)", () => {
  const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) =>
    r.success ? [] : r.error!.issues.map((i) => i.message);
  const therapy = { patientId: "550e8400-e29b-41d4-a716-446655440000", date: "2026-09-21", durationMinutes: 50 };
  const group = { groupId: "550e8400-e29b-41d4-a716-446655440001", date: "2026-09-21", status: "durchgefuehrt" as const, childCount: 8 };

  it.each([
    [undefined, "Bitte eine Dauer angeben"],
    [Number.NaN, "Bitte eine Dauer angeben"],
    [12.5, "Dauer in ganzen Minuten eingeben"],
    [0, "Dauer muss mindestens 1 Minute sein"],
    [481, "Dauer darf höchstens 480 Minuten sein"],
  ])("Therapiesitzung mit Dauer %s: „%s“", (durationMinutes, message) => {
    expect(messages(addTherapySessionSchema.safeParse({ ...therapy, durationMinutes }))).toEqual([message]);
  });

  it("Doppelstunde: Dauer bleibt optional (100), meldet aber deutsch", () => {
    expect(addGroupSessionSchema.parse(group).durationMinutes).toBe(100);
    expect(messages(addGroupSessionSchema.safeParse({ ...group, durationMinutes: 481 }))).toEqual(["Dauer darf höchstens 480 Minuten sein"]);
    expect(messages(addGroupSessionSchema.safeParse({ ...group, durationMinutes: 0 }))).toEqual(["Dauer muss mindestens 1 Minute sein"]);
  });

  it("leeres Datum: „Bitte ein Datum angeben“ – nur diese eine Meldung; falsches Format bleibt „Ungültiges Datumsformat“", () => {
    expect(messages(addTherapySessionSchema.safeParse({ ...therapy, date: "" }))).toEqual(["Bitte ein Datum angeben"]);
    expect(messages(addTherapySessionSchema.safeParse({ ...therapy, date: "21.09.2026" }))).toEqual(["Ungültiges Datumsformat"]);
    expect(messages(addGroupSessionSchema.safeParse({ ...group, date: "" }))).toEqual(["Bitte ein Datum angeben"]);
    expect(messages(addPatientSchema.safeParse({ chiffre: "A-1", therapyType: "kurzzeittherapie", startDate: "" }))).toEqual(["Bitte ein Datum angeben"]);
    expect(messages(nachweisFilterSchema.safeParse({ from: "", to: "2026-09-30" }))).toEqual(["Bitte ein Datum angeben"]);
  });
});
