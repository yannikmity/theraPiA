import { redirect } from "next/navigation";
import { getSession } from "@/lib/require-session";
import { AppShell } from "@/components/layout/AppShell";
import { FeedbackWidget } from "@/components/feedback/FeedbackWidget";

// Rahmen für alle Seiten hinter dem Login. Der Zugriffsschutz bleibt in den Seiten (requireSession) und
// im Proxy – Layouts laufen bei Soft-Navigation nicht erneut; hier wird die Rolle für die Navigation gelesen
// und ohne Sitzung zusätzlich zum Login umgeleitet (Absicherung in der Tiefe).
// Das Feedback-Widget hängt nur hier (nicht auf Login/Registrierung/Reset).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session?.user) redirect("/auth/login");
  return (
    <>
      <AppShell role={session.user.role} demo={session.user.demo === true}>
        {children}
      </AppShell>
      <FeedbackWidget userName={session.user.name ?? ""} />
    </>
  );
}
