import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "./db";
import { authConfig } from "./auth.config";
import { loginThrottle, clientIp } from "./rate-limit";
import type { LoginErrorCode } from "./login-errors";
import { attemptLogin } from "./services/login";
import { refreshTokenSafely } from "./services/session";

// NextAuth hängt `code` einer CredentialsSignin an die Antwort; signIn() im Browser liefert ihn als
// result.code. So unterscheidet das Login-Formular Limit und Ausfall von falschen Zugangsdaten.
class LoginRejected extends CredentialsSignin {
  constructor(code: LoginErrorCode) {
    super();
    this.code = code;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // Serverseitig bei jedem auth()-Aufruf: gesperrte Accounts und alte Sitzungen
    // (nach Passwortwechsel oder Sperre) verlieren sofort den Zugang.
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.sv = user.sessionVersion;
        token.demo = user.demo === true;
        return token;
      }
      return refreshTokenSafely(db, token);
    },
  },
  providers: [
    Credentials({
      name: "E-Mail & Passwort",
      credentials: {
        email: { label: "E-Mail", type: "email" },
        password: { label: "Passwort", type: "password" },
      },
      async authorize(credentials, request) {
        const result = await attemptLogin(db, loginThrottle, {
          email: String(credentials?.email ?? ""),
          password: String(credentials?.password ?? ""),
          clientIp: clientIp(request.headers),
        });
        if (!result.ok) throw new LoginRejected(result.code);
        return result.user;
      },
    }),
  ],
});
