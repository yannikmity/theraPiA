// @vitest-environment node
import { describe, it, expect } from "vitest";
import { decodeScreenshot, feedbackPayloadSchema } from "../feedback/validation";
import { SCREENSHOT_MAX_BYTES } from "../feedback/model";

const PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const valid = {
  page: "/patients/abc",
  element: "Speichern",
  selector: "main > form > button",
  sentiment: "wunsch",
  text: "  Bitte Datum vorbelegen.  ",
  viewport: "1440x900",
  screenshot: null,
};

describe("feedbackPayloadSchema", () => {
  it("akzeptiert ein gültiges Feedback und trimmt den Text", () => {
    const parsed = feedbackPayloadSchema.parse(valid);
    expect(parsed.text).toBe("Bitte Datum vorbelegen.");
    expect(parsed.sentiment).toBe("wunsch");
  });

  it("verlangt Text und ein bekanntes Sentiment", () => {
    expect(feedbackPayloadSchema.safeParse({ ...valid, text: "   " }).success).toBe(false);
    expect(feedbackPayloadSchema.safeParse({ ...valid, sentiment: "egal" }).success).toBe(false);
  });

  it("begrenzt Text, Element, Selector und Seite", () => {
    expect(feedbackPayloadSchema.safeParse({ ...valid, text: "x".repeat(4001) }).success).toBe(false);
    expect(feedbackPayloadSchema.safeParse({ ...valid, element: "x".repeat(121) }).success).toBe(false);
    expect(feedbackPayloadSchema.safeParse({ ...valid, selector: "x".repeat(601) }).success).toBe(false);
    expect(feedbackPayloadSchema.safeParse({ ...valid, page: "x".repeat(301) }).success).toBe(false);
  });

  it("viewport und screenshot sind optional", () => {
    const { viewport, screenshot, ...rest } = valid;
    void viewport;
    void screenshot;
    expect(feedbackPayloadSchema.parse(rest)).toMatchObject({ viewport: "", screenshot: null });
  });

  it("übernimmt keine Identitätsfelder aus dem Body", () => {
    const parsed = feedbackPayloadSchema.parse({
      ...valid,
      userId: "fremd",
      userEmail: "fremd@example.com",
      userName: "Fremde Person",
      user: { id: "fremd" },
    });
    expect(Object.keys(parsed).sort()).toEqual(
      ["element", "page", "screenshot", "selector", "sentiment", "text", "viewport"],
    );
  });
});

describe("decodeScreenshot", () => {
  it("dekodiert eine PNG-Data-URL", () => {
    const png = decodeScreenshot(`data:image/png;base64,${PNG_B64}`);
    expect(png?.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });

  it("liefert null für fehlende, fremde, kaputte und zu große Bilder", () => {
    expect(decodeScreenshot(null)).toBeNull();
    expect(decodeScreenshot(undefined)).toBeNull();
    expect(decodeScreenshot("")).toBeNull();
    expect(decodeScreenshot(`data:image/jpeg;base64,${PNG_B64}`)).toBeNull();
    expect(decodeScreenshot("data:image/png;base64,%%%nicht-base64")).toBeNull();
    // Gültiges Base64, aber kein PNG (Text "hallo")
    expect(decodeScreenshot("data:image/png;base64,aGFsbG8=")).toBeNull();
    const tooBig = "data:image/png;base64," + "A".repeat(Math.ceil((SCREENSHOT_MAX_BYTES * 4) / 3) + 100);
    expect(decodeScreenshot(tooBig)).toBeNull();
  });
});
