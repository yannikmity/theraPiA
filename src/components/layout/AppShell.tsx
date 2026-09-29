import type { ReactNode } from "react";
import { FAB_CLEARANCE } from "@/components/feedback/fab-zone";
import type { Role } from "@/lib/registration-policy";
import { cn } from "@/lib/utils";
import { BottomNav } from "./BottomNav";
import { DemoHinweis } from "./DemoHinweis";
import { Sidebar } from "./Sidebar";
import { Wordmark } from "./Wordmark";

// Druck (Nachweis): Navigation und Kopfzeile verschwinden, der Inhalt nimmt die ganze Seite ein. Die Sidebar steckt in
// einem print:hidden-Wrapper, weil ihr md:flex ein print:hidden am Element überstimmen würde (print liegt im CSS vor
// den Breakpoints); aus demselben Grund tragen pl/p das !-Suffix. Der Wrapper stört die fixierte Sidebar nicht.
// Unten hält FAB_CLEARANCE die Zone des Feedback-Knopfs frei (fab-zone.ts). Demo-Accounts (#9) sehen oben im Inhalt den DemoHinweis.
// Seitliche Safe-Areas (#56): Die Seitenleiste wächst um safe-area-inset-left (Querformat, Notch links), der Inhalt hält
// rechts ab md mindestens safe-area-inset-right frei; links von <main> liegt ab md die Seitenleiste.
export function AppShell({ role, demo = false, children }: { role: Role; demo?: boolean; children: ReactNode }) {
  return (
    <div className="min-h-svh md:pl-[calc(15rem+env(safe-area-inset-left))] print:pl-0!">
      <div className="print:hidden">
        <Sidebar role={role} />
      </div>
      <header className="sticky top-0 z-40 border-b border-border bg-card/80 pt-[env(safe-area-inset-top)] backdrop-blur-md md:hidden print:hidden">
        <div className="flex h-14 items-center pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
          <Wordmark />
        </div>
      </header>
      <main className={cn("mx-auto w-full max-w-5xl pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-4 md:pl-8 md:pr-[max(2rem,env(safe-area-inset-right))] md:pt-8 print:max-w-none print:p-0!", FAB_CLEARANCE)}>
        {demo && <DemoHinweis />}
        {children}
      </main>
      <BottomNav role={role} />
    </div>
  );
}
