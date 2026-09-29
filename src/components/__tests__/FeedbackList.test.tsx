import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeedbackList, formatFeedbackTime } from "../../app/(app)/admin/feedback/FeedbackList";
import type { FeedbackMeta } from "@/lib/feedback/model";

const item: FeedbackMeta = {
  id: "20260926-143000-0123abcd",
  userId: "11111111-1111-4111-8111-111111111111",
  userEmail: "a@example.com",
  userName: "PiA A",
  page: "/patients/33333333-3333-4333-8333-333333333333",
  element: "Sitzung bearbeiten",
  selector: "main > button",
  sentiment: "negativ",
  screenshot: true,
  viewport: "390x844",
  userAgent: "Mozilla/5.0 (Test)",
  createdAt: "2026-09-26T12:30:00.000Z",
};

describe("FeedbackList", () => {
  it("zeigt einen leeren Zustand", () => {
    render(<FeedbackList items={[]} />);
    expect(screen.getByText("Noch kein Feedback.")).toBeDefined();
  });

  it("verlinkt jedes Feedback mit Sentiment, Element, Seite, Person und Zeit", () => {
    render(<FeedbackList items={[item, { ...item, id: "20260925-090000-ffffffff", sentiment: "wunsch", screenshot: false }]} />);
    const links = screen.getAllByRole("link", { name: /Sitzung bearbeiten/ });
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/admin/feedback/20260926-143000-0123abcd",
      "/admin/feedback/20260925-090000-ffffffff",
    ]);
    expect(links[0].textContent).toContain("Stört mich");
    expect(links[0].textContent).toContain("/patients/33333333-3333-4333-8333-333333333333");
    expect(links[0].textContent).toContain("PiA A");
    expect(links[0].textContent).toContain("a@example.com");
    expect(links[1].textContent).toContain("Wunsch");
    expect(screen.getAllByLabelText("mit Screenshot")).toHaveLength(1);
  });

  it("formatiert die Zeit deutsch aus dem ISO-Zeitstempel", () => {
    expect(formatFeedbackTime(new Date(2026, 8, 26, 14, 30).toISOString())).toBe("26.09.2026, 14:30");
  });

  it("fällt bei beschädigtem Zeitstempel auf den Rohwert bzw. einen Strich zurück, statt zu werfen", () => {
    expect(formatFeedbackTime("")).toBe("–");
    expect(formatFeedbackTime("kaputt")).toBe("kaputt");
    render(<FeedbackList items={[{ ...item, createdAt: "kaputt" }]} />);
    expect(screen.getByRole("link", { name: /Sitzung bearbeiten/ }).textContent).toContain("kaputt");
  });
});
