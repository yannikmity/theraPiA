import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

import { AppShell } from "../layout/AppShell";
import { FAB_CLEARANCE, FAB_CORNER } from "../feedback/fab-zone";

const rem = (s: string, re: RegExp) => Number(re.exec(s)![1]);

describe("AppShell", () => {
  it("hält am Ende des Inhalts die Zone des Feedback-Knopfs frei – auf allen Seiten, kein zweites pb-*", () => {
    const { container } = render(
      <AppShell role="pia">
        <p>Inhalt</p>
      </AppShell>
    );
    const classes = container.querySelector("main")!.className.split(/\s+/);
    for (const cls of FAB_CLEARANCE.split(" ")) expect(classes).toContain(cls);
    expect(classes.filter((c) => /^pb-/.test(c))).toEqual([FAB_CLEARANCE.split(" ")[0]]);
  });

  it("die Freihaltung reicht über den Knopf hinaus: Unterkante plus 3rem Höhe (size=lg), am Handy und ab md", () => {
    expect(rem(FAB_CLEARANCE, /^pb-\[calc\(([\d.]+)rem/)).toBeGreaterThanOrEqual(rem(FAB_CORNER, /bottom-\[calc\(([\d.]+)rem/) + 3);
    expect(rem(FAB_CLEARANCE, /md:pb-(\d+)/) * 0.25).toBeGreaterThanOrEqual(rem(FAB_CORNER, /md:bottom-(\d+)/) * 0.25 + 3);
  });

  it("hält die Safe-Areas frei: Kopfzeile oben, Inhalt links/rechts, Bottom-Navigation unten und seitlich", () => {
    const { container } = render(
      <AppShell role="pia">
        <p>Inhalt</p>
      </AppShell>
    );
    expect(container.querySelector("header")!.className).toContain("pt-[env(safe-area-inset-top)]");
    const main = container.querySelector("main")!.className;
    expect(main).toContain("pl-[max(1rem,env(safe-area-inset-left))]");
    expect(main).toContain("pr-[max(1rem,env(safe-area-inset-right))]");
    expect(main).not.toContain("px-4");
    const bottom = screen.getAllByRole("navigation", { name: "Hauptnavigation" }).find((nav) => nav.className.includes("bottom-0"))!;
    expect(bottom.className).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(bottom.className).toContain("pl-[env(safe-area-inset-left)]");
    expect(bottom.className).toContain("pr-[env(safe-area-inset-right)]");
  });

  it("zeigt Demo-Accounts oben im Inhalt einen Hinweis – auch im Druck, damit kein Demo-Nachweis als echt durchgeht", () => {
    render(
      <AppShell role="pia" demo>
        <p>Inhalt</p>
      </AppShell>
    );
    const hinweis = screen.getByRole("note", { name: "Demo-Account" });
    expect(hinweis.textContent).toContain("fiktive Beispieldaten");
    expect(hinweis.textContent).toContain("keine echten Daten");
    expect(hinweis.closest("main")).not.toBeNull();
    expect(hinweis.className).not.toContain("print:hidden");
  });

  it("zeigt ohne Demo-Kennzeichen keinen Hinweis", () => {
    render(
      <AppShell role="pia">
        <p>Inhalt</p>
      </AppShell>
    );
    expect(screen.queryByRole("note", { name: "Demo-Account" })).toBeNull();
  });

  it("hält im Querformat die seitlichen Safe-Areas frei: Seitenleiste, Einrückung, Kopfzeile, Inhalt rechts ab md", () => {
    const { container } = render(
      <AppShell role="pia">
        <p>Inhalt</p>
      </AppShell>
    );
    const shell = (container.firstElementChild as HTMLElement).className.split(/\s+/);
    expect(shell).toContain("md:pl-[calc(15rem+env(safe-area-inset-left))]");
    expect(shell).not.toContain("md:pl-60");
    const aside = container.querySelector("aside")!.className.split(/\s+/);
    expect(aside).toContain("w-[calc(15rem+env(safe-area-inset-left))]");
    expect(aside).toContain("pl-[env(safe-area-inset-left)]");
    expect(aside).not.toContain("w-60");
    const headerRow = container.querySelector("header > div")!.className.split(/\s+/);
    expect(headerRow).toContain("pl-[max(1rem,env(safe-area-inset-left))]");
    expect(headerRow).toContain("pr-[max(1rem,env(safe-area-inset-right))]");
    expect(headerRow).not.toContain("px-4");
    const main = container.querySelector("main")!.className.split(/\s+/);
    expect(main).not.toContain("md:px-8");
    expect(main).toContain("md:pl-8");
    expect(main).toContain("md:pr-[max(2rem,env(safe-area-inset-right))]");
  });
});
