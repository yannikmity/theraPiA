import {
  FORGOT_LIMIT_PER_CLIENT,
  FORGOT_LIMIT_PER_EMAIL,
  FORGOT_WINDOW_MINUTES,
  LOGIN_LIMIT_PER_CLIENT,
  LOGIN_LIMIT_PER_EMAIL,
  LOGIN_WINDOW_MINUTES,
  PASSWORD_CHECK_LIMIT,
  PASSWORD_CHECK_WINDOW_MINUTES,
} from "./constants";

// In-Memory-Limiter. Reicht für eine Instanz mit einem App-Container;
// bei mehreren Containern müsste der Zähler in die Datenbank.
export interface RateLimiter {
  check(key: string): boolean;
  reset(key: string): void;
  /** Anzahl Schlüssel mit gespeicherten Treffern – für Tests des Aufräumens, sonst nicht nötig. */
  size(): number;
}

export function createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const hits = new Map<string, number[]>();

  return {
    check(key) {
      const t = now();
      const recent = (hits.get(key) ?? []).filter((ts) => t - ts < opts.windowMs);
      if (recent.length >= opts.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(t);
      hits.set(key, recent);
      // Aufräumen erst ab 10.000 Schlüsseln: abgelaufene Einträge kosten sonst nur Speicher, keinen Fehler.
      if (hits.size > 10_000) {
        for (const [k, v] of hits) {
          if (v.every((ts) => t - ts >= opts.windowMs)) hits.delete(k);
        }
      }
      return true;
    },
    reset(key) {
      hits.delete(key);
    },
    size() {
      return hits.size;
    },
  };
}

// Hinter Caddy steht die echte Client-Adresse an erster Stelle; der App-Port ist nicht öffentlich.
export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}

// Anmeldeversuche: pro Client und Adresse (Passwort-Raten von einer Adresse aus) und zusätzlich pro
// Adresse über alle Clients (ein Konto aus vielen Adressen). Beide Zähler werden bei jedem Versuch
// bewegt, damit ein Versuch, den der eine Zähler blockt, im anderen nicht „kostenlos“ bleibt.
export interface LoginThrottle {
  allow(clientIp: string, email: string): boolean;
  reset(clientIp: string, email: string): void;
}

export function createLoginThrottle(perClient: RateLimiter, perEmail: RateLimiter): LoginThrottle {
  return {
    allow(clientIp, email) {
      const clientOk = perClient.check(`${clientIp}:${email}`);
      const emailOk = perEmail.check(email);
      return clientOk && emailOk;
    },
    reset(clientIp, email) {
      perClient.reset(`${clientIp}:${email}`);
      perEmail.reset(email);
    },
  };
}

export const loginThrottle = createLoginThrottle(
  createRateLimiter({ limit: LOGIN_LIMIT_PER_CLIENT, windowMs: LOGIN_WINDOW_MINUTES * 60_000 }),
  createRateLimiter({ limit: LOGIN_LIMIT_PER_EMAIL, windowMs: LOGIN_WINDOW_MINUTES * 60_000 })
);
export const registerLimiter = createRateLimiter({ limit: 5, windowMs: 60 * 60_000 });
export const resetLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60_000 });

// Erneute Passworteingabe angemeldeter Personen (Passwort ändern, Account löschen), Schlüssel = Nutzer-ID:
// eine gestohlene Sitzung soll das Passwort nicht durchprobieren können.
export const passwordCheckLimiter = createRateLimiter({
  limit: PASSWORD_CHECK_LIMIT,
  windowMs: PASSWORD_CHECK_WINDOW_MINUTES * 60_000,
});

// „Passwort vergessen“: pro Client+Adresse und pro Adresse über alle Clients – begrenzt Mails an fremde Postfächer.
export const forgotThrottle = createLoginThrottle(
  createRateLimiter({ limit: FORGOT_LIMIT_PER_CLIENT, windowMs: FORGOT_WINDOW_MINUTES * 60_000 }),
  createRateLimiter({ limit: FORGOT_LIMIT_PER_EMAIL, windowMs: FORGOT_WINDOW_MINUTES * 60_000 })
);
