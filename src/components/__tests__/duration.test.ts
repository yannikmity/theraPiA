import { describe, it, expect } from "vitest";
import { DURATION_MAX_MINUTES, DURATION_MIN_MINUTES, durationError } from "../forms/duration";

describe("durationError", () => {
  it("prüft ganze Minuten von 1 bis 480 mit denselben Worten wie das Server-Schema", () => {
    expect(DURATION_MIN_MINUTES).toBe(1);
    expect(DURATION_MAX_MINUTES).toBe(480);
    expect(durationError("50")).toBeUndefined();
    expect(durationError("0")).toBe("Dauer muss mindestens 1 Minute sein");
    expect(durationError("-5")).toBe("Dauer muss mindestens 1 Minute sein");
    expect(durationError("481")).toBe("Dauer darf höchstens 480 Minuten sein");
    expect(durationError("")).toBe("Bitte eine Dauer angeben");
    expect(durationError("  ")).toBe("Bitte eine Dauer angeben");
    expect(durationError("12.5")).toBe("Dauer in ganzen Minuten eingeben");
    expect(durationError("abc")).toBe("Dauer in ganzen Minuten eingeben");
  });

  it("meldet dasselbe wie das Server-Schema", async () => {
    const { addTherapySessionSchema } = await import("@/lib/validation");
    const server = (durationMinutes: unknown) => {
      const r = addTherapySessionSchema.safeParse({ patientId: "550e8400-e29b-41d4-a716-446655440000", date: "2026-09-21", durationMinutes });
      return r.success ? undefined : r.error.issues[0].message;
    };
    expect(durationError("")).toBe(server(Number.NaN));
    expect(durationError("12.5")).toBe(server(12.5));
    expect(durationError("0")).toBe(server(0));
    expect(durationError("481")).toBe(server(481));
  });
});
