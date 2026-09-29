import { describe, it, expect } from "vitest";
import nextConfig from "../../../next.config.mjs";

describe("next.config", () => {
  it("baut standalone und setzt die statischen Security-Header auf allen Pfaden – CSP kommt aus dem Proxy", async () => {
    expect(nextConfig.output).toBe("standalone");
    const [rule] = await nextConfig.headers!();
    expect(rule.source).toBe("/(.*)");
    const keys = rule.headers.map((h: { key: string }) => h.key);
    expect(keys).toEqual([
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]);
  });

  it("puffert im Proxy Request-Bodies bis 12 MB (Feedback-Screenshot als Base64, Standard wären 10 MB)", () => {
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe("12mb");
  });
});
