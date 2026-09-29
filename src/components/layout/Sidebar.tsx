"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/registration-policy";
import { cn } from "@/lib/utils";
import { isNavItemActive, navItemsFor } from "./nav-items";
import { Wordmark } from "./Wordmark";

// Desktop-Navigation (ab md). Mobil übernimmt BottomNav; beide lesen dieselbe Liste aus nav-items.ts.
export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[calc(15rem+env(safe-area-inset-left))] pl-[env(safe-area-inset-left)] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-16 items-center px-6">
        <Wordmark />
      </div>
      <nav aria-label="Hauptnavigation" className="flex-1 space-y-1 px-3 py-2">
        {navItemsFor(role, "sidebar").map((item) => {
          const active = isNavItemActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="size-5" strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
