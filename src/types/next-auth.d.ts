import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    // demo optional: nur für den Hinweis in der Oberfläche; fehlend heißt kein Demo-Account.
    user: { id: string; role: "admin" | "pia"; demo?: boolean } & DefaultSession["user"];
  }
  interface User {
    role?: "admin" | "pia";
    sessionVersion?: number;
    demo?: boolean;
  }
}
