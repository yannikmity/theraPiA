import { Wordmark } from "@/components/layout/Wordmark";

// Login, Registrierung, Reset: zentriert, ohne Navigation. viewport-fit=cover gilt auch hier – die Abstände halten
// Statusleiste, Home-Indikator und im Querformat die Notch frei (#56).
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background pt-[max(3rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
      <div className="mb-6">
        <Wordmark />
      </div>
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
