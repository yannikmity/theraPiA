import { describe, it, expect } from "vitest";
import { sanitizePath, sanitizePayload, sanitizeReferrer } from "../analytics/sanitize";

const ID = "3f9a1c2b-7d4e-4a6b-8c1d-0e2f3a4b5c6d";

describe("sanitizePath", () => {
  it.each([
    ["/", "/"],
    ["", "/"],
    ["/patients", "/patients"],
    [`/patients/${ID}`, "/patients/[id]"],
    [`/patients/${ID.toUpperCase()}`, "/patients/[id]"],
    [`/groups/${ID}/sessions/${ID}`, "/groups/[id]/sessions/[id]"],
    ["/auth/register?invite=geheim", "/auth/register"],
    ["/auth/reset?token=abc#top", "/auth/reset"],
    ["/patients/A-1", "/patients/A-1"],
    // Feedback-IDs (Zeitstempel + Zufall) sind ebenfalls Datensatz-Kennungen
    ["/admin/feedback/20260926-101500-0a1b2c3d", "/admin/feedback/[id]"],
    ["/api/feedback/20260926-101500-0a1b2c3d/screenshot", "/api/feedback/[id]/screenshot"],
  ])("%s → %s", (input, expected) => {
    expect(sanitizePath(input)).toBe(expected);
  });
});

describe("sanitizeReferrer", () => {
  it("kürzt eigene Verweise auf Origin + anonymisierten Pfad, fremde auf ihre Origin", () => {
    expect(sanitizeReferrer(`https://app.example.net/patients/${ID}?x=1`, "https://app.example.net")).toBe(
      "https://app.example.net/patients/[id]"
    );
    expect(sanitizeReferrer("https://mail.example.org/inbox/123", "https://app.example.net")).toBe("https://mail.example.org");
    expect(sanitizeReferrer("", "https://app.example.net")).toBe("");
    expect(sanitizeReferrer("kein-url", "https://app.example.net")).toBe("");
  });

  it("löst relative eigene Verweise (so liefert Umami sie) gegen die eigene Origin auf", () => {
    expect(sanitizeReferrer(`/patients/${ID}?x=1#f`, "https://app.example.net")).toBe("https://app.example.net/patients/[id]");
    expect(sanitizeReferrer("//mail.example.org/inbox", "https://app.example.net")).toBe("https://mail.example.org");
  });
});

describe("sanitizePayload", () => {
  it("anonymisiert url und referrer, entfernt title, lässt den Rest unverändert", () => {
    const payload = {
      website: "w",
      hostname: "app.example.net",
      screen: "1440x900",
      language: "de-DE",
      title: "Patient:in A-1",
      url: `/patients/${ID}?tab=1`,
      referrer: `https://app.example.net/groups/${ID}`,
    };
    expect(sanitizePayload(payload, "https://app.example.net")).toEqual({
      website: "w",
      hostname: "app.example.net",
      screen: "1440x900",
      language: "de-DE",
      title: undefined,
      url: "/patients/[id]",
      referrer: "https://app.example.net/groups/[id]",
    });
  });
});
