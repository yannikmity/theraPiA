import { requireSession } from "@/lib/require-session";
import { PasswordForm } from "./PasswordForm";

export default async function ChangePasswordPage() {
  await requireSession();

  return <PasswordForm />;
}
