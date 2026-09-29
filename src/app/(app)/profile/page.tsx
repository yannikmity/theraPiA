import { requireSession } from "@/lib/require-session";
import { ProfileClient } from "./ProfileClient";

export default async function ProfilePage() {
  const session = await requireSession();

  return (
    <ProfileClient
      userName={session.user?.name || ""}
      userEmail={session.user?.email || ""}
      isAdmin={session.user?.role === "admin"}
    />
  );
}
