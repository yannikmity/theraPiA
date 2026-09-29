import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

// next/script wird durch einen Rekorder ersetzt: geprüft wird, welche Props das Script bekommt, nicht das Laden.
const scriptProps = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("next/script", () => ({
  default: (props: Record<string, unknown>) => {
    scriptProps.push(props);
    return null;
  },
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/lib/analytics/track", () => ({ trackPageview: vi.fn() }));

import { UmamiScript } from "@/components/analytics/UmamiScript";

describe("UmamiScript", () => {
  it("gibt die Nonce aus dem Proxy an next/script weiter", () => {
    render(
      <UmamiScript
        scriptUrl="https://analytics.example.org/script.js"
        websiteId="11111111-1111-4111-8111-111111111111"
        nonce="AAAAAAAAAAAAAAAAAAAAAA=="
      />
    );
    expect(scriptProps.at(-1)).toMatchObject({
      src: "https://analytics.example.org/script.js",
      "data-website-id": "11111111-1111-4111-8111-111111111111",
      "data-auto-track": "false",
      strategy: "afterInteractive",
      nonce: "AAAAAAAAAAAAAAAAAAAAAA==",
    });
  });
});
