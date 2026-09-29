import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));

import { ForecastAssumption } from "../dashboard/ForecastAssumption";
import { track } from "../../lib/analytics/track";

describe("ForecastAssumption", () => {
  beforeEach(() => vi.mocked(track).mockReset());

  it("klappt die Annahmen auf und zählt nur das Aufklappen", () => {
    const { container } = render(
      <ForecastAssumption>
        <p>Annahme</p>
      </ForecastAssumption>
    );
    const details = container.querySelector("details")!;
    expect(screen.getByText("So kommt die Prognose zustande")).toBeDefined();
    expect(screen.getByText("Annahme")).toBeDefined();
    details.open = true;
    fireEvent(details, new Event("toggle"));
    details.open = false;
    fireEvent(details, new Event("toggle"));
    expect(vi.mocked(track).mock.calls).toEqual([["dashboard_forecast_viewed"]]);
  });
});
