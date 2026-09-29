import type { NextAuthConfig } from "next-auth";
import { SESSION_MAX_AGE_SECONDS, SESSION_UPDATE_AGE_SECONDS } from "./constants";

export const authConfig = {
  pages: {
    signIn: "/auth/login",
  },
  // JWT-Sitzung mit gleitender Frist: nach maxAge ohne Nutzung abgemeldet. Bei JWT-Sitzungen stellt
  // @auth/core 0.41 das Token bei jeder Anfrage über den Proxy neu aus und setzt das Cookie neu;
  // updateAge wirkt nur bei Datenbank-Sitzungen und steht hier nur zur Klarheit und für einen
  // späteren Wechsel explizit. Effektiv: abgemeldet nach 7 Tagen ohne Nutzung. Sperre und
  // Passwortwechsel beenden Sitzungen unabhängig davon sofort (session_version, siehe refreshToken).
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
    updateAge: SESSION_UPDATE_AGE_SECONDS,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sv = user.sessionVersion;
        token.demo = user.demo === true;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as "admin" | "pia" | undefined) ?? "pia";
        session.user.demo = token.demo === true;
      }
      return session;
    },
    // Läuft im Proxy (src/proxy.ts) ohne Datenbank: ein Cookie kann kryptografisch gültig,
    // aber per session_version oder Sperre bereits entwertet sein. Deshalb hier keine
    // Umleitung eingeloggter Nutzer weg von den Auth-Seiten – das erledigen die Seiten
    // selbst mit dem DB-geprüften auth() (sonst Redirect-Schleife bei alter Sitzung).
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;
      const matches = (p: string) => path === p || path.startsWith(p + "/");
      const isAuthPage = ["/auth/login", "/auth/register", "/auth/reset"].some(matches);
      const isPublicApi = matches("/api/auth") || path === "/api/health";
      // Browser laden das Web-App-Manifest ohne Cookies – ein Redirect zum Login würde es unbrauchbar machen.
      const isPublicAsset = path === "/manifest.json";

      if (isPublicApi || isAuthPage || isPublicAsset) return true;
      // API-Aufrufe (fetch, curl) bekommen ohne Sitzung 401 als JSON – ein Redirect auf die Login-Seite
      // wäre für sie unbrauchbar. Seiten werden weiterhin umgeleitet.
      if (!isLoggedIn && path.startsWith("/api/")) {
        return Response.json({ error: "Nicht angemeldet" }, { status: 401 });
      }
      if (!isLoggedIn && path !== "/") {
        return Response.redirect(new URL("/auth/login", nextUrl));
      }
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
