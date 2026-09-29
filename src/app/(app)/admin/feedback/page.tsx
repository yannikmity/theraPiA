import { redirect } from "next/navigation";
import { requireSession } from "@/lib/require-session";
import { getFeedbackStore } from "@/lib/feedback";
import { FeedbackList } from "./FeedbackList";

export const dynamic = "force-dynamic";

// Liste aller Feedbacks aus dem Widget – nur für Admins (wie /admin).
export default async function AdminFeedbackPage() {
  const session = await requireSession();
  if (session.user.role !== "admin") redirect("/");
  const items = await getFeedbackStore().list();
  return <FeedbackList items={items} />;
}
