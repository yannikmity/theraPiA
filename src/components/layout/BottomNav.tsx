"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/registration-policy";
import { cn } from "@/lib/utils";
import { isNavItemActive, navItemsFor } from "./nav-items";

// Mobile Navigation (unter md). Fünf Tabs; Supervision, Gruppen und Administration bleiben über Profil erreichbar.
export function BottomNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Hauptnavigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] md:hidden print:hidden"
    >
      <div className="flex justify-around">
        {navItemsFor(role, "bottom").map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center py-2 text-[11px] transition-colors",
                active ? "font-semibold text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="size-[22px]" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
              <span className="mt-0.5 max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
