import { describe, it, expect } from "vitest";
import { checkSetupToken, setupState } from "../setup-token";

const TOKEN = "einrichtung-0123456789";
const publicUrl = "https://therapia.beispiel-institut.de";

describe("checkSetupToken", () => {
  it("akzeptiert den gesetzten Einrichtungscode, auch mit Leerzeichen am Rand", () => {
    expect(checkSetupToken({ SETUP_TOKEN: TOKEN, NEXTAUTH_URL: publicUrl }, TOKEN)).toBe("ok");
    expect(checkSetupToken({ SETUP_TOKEN: TOKEN, NEXTAUTH_URL: publicUrl }, ` ${TOKEN} `)).toBe("ok");
  });

  it("lehnt einen fehlenden oder falschen Code ab", () => {
    expect(checkSetupToken({ SETUP_TOKEN: TOKEN, NEXTAUTH_URL: publicUrl }, undefined)).toBe("wrong-code");
    expect(checkSetupToken({ SETUP_TOKEN: TOKEN, NEXTAUTH_URL: publicUrl }, "falsch")).toBe("wrong-code");
    expect(checkSetupToken({ SETUP_TOKEN: TOKEN, NEXTAUTH_URL: publicUrl }, `${TOKEN}x`)).toBe("wrong-code");
  });

  it("verlangt den Code auch lokal, wenn er gesetzt ist", () => {
    expect(checkSetupToken({ SETUP_TOKEN: TOKEN, NEXTAUTH_URL: "http://localhost:3010" }, undefined)).toBe("wrong-code");
  });

  it("sperrt die Einrichtung einer öffentlichen Instanz ohne SETUP_TOKEN", () => {
    expect(checkSetupToken({ NEXTAUTH_URL: publicUrl }, "irgendwas")).toBe("missing-config");
  });

  it("verlangt im Produktionsbuild den Code auch auf localhost (z. B. hinter einem Proxy)", () => {
    expect(checkSetupToken({ NEXTAUTH_URL: "http://localhost:3000" }, undefined, true)).toBe("missing-config");
    expect(setupState({ NEXTAUTH_URL: "http://localhost:3000" }, true)).toBe("blocked");
  });

  it("lässt eine lokale Entwicklungsinstanz ohne SETUP_TOKEN einrichten", () => {
    expect(checkSetupToken({ NEXTAUTH_URL: "http://localhost:3010" }, undefined)).toBe("ok");
    expect(checkSetupToken({ NEXTAUTH_URL: "http://127.0.0.1:3100" }, undefined)).toBe("ok");
  });
});

describe("setupState", () => {
  it("unterscheidet Code nötig, gesperrt und frei", () => {
    expect(setupState({ SETUP_TOKEN: TOKEN, NEXTAUTH_URL: publicUrl })).toBe("code-required");
    expect(setupState({ NEXTAUTH_URL: publicUrl })).toBe("blocked");
    expect(setupState({ NEXTAUTH_URL: "http://localhost:3010" })).toBe("open");
  });
});
