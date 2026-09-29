import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { countUsers } from "@/lib/services/registration";
import { RegisterForm } from "./RegisterForm";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  // DB-geprüft wie auf der Login-Seite: nur eine noch gültige Sitzung wird weitergeleitet.
  const session = await auth();
  if (session?.user?.id) {
    redirect("/");
  }

  const { invite } = await searchParams;
  const userCount = await countUsers(db);
  const mode = getConfig().REGISTRATION_MODE;
  const registrationOpen = userCount === 0 || Boolean(invite) || mode === "open";
  return (
    <RegisterForm
      inviteToken={invite ?? null}
      registrationOpen={registrationOpen}
      closedMode={mode === "closed"}
      isSetup={userCount === 0}
    />
  );
}
