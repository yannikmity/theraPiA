import type { LucideIcon } from "lucide-react";
import { BookOpen, FileSignature, LayoutDashboard, PlusCircle, Shield, TrendingUp, User, Users, UsersRound } from "lucide-react";
import type { Role } from "@/lib/registration-policy";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Pfade (Präfix auf Segmentgrenze), bei denen der Eintrag als aktiv gilt. */
  activeFor: string[];
  /** Erscheint auch in der mobilen Bottom-Navigation (maximal fünf Einträge). */
  mobile: boolean;
  adminOnly?: boolean;
}

// Eine Liste für Seitenleiste und Bottom-Navigation: Reihenfolge, Icons und Aktiv-Logik bleiben identisch.
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, activeFor: ["/"], mobile: true },
  { href: "/sessions/new", label: "Erfassen", icon: PlusCircle, activeFor: ["/sessions"], mobile: true },
  { href: "/patients", label: "Patient:innen", icon: Users, activeFor: ["/patients"], mobile: true },
  { href: "/supervision", label: "Supervision", icon: BookOpen, activeFor: ["/supervision", "/supervisors"], mobile: false },
  { href: "/groups", label: "Gruppen", icon: UsersRound, activeFor: ["/groups"], mobile: false },
  { href: "/finances", label: "Finanzen", icon: TrendingUp, activeFor: ["/finances"], mobile: true },
  { href: "/nachweis", label: "Nachweis", icon: FileSignature, activeFor: ["/nachweis"], mobile: false },
  { href: "/profile", label: "Profil", icon: User, activeFor: ["/profile", "/checklist"], mobile: true },
  { href: "/admin", label: "Administration", icon: Shield, activeFor: ["/admin"], mobile: false, adminOnly: true },
];

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  return item.activeFor.some((prefix) =>
    prefix === "/" ? pathname === "/" : pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function navItemsFor(role: Role | undefined, placement: "sidebar" | "bottom"): NavItem[] {
  return NAV_ITEMS.filter((item) => placement === "sidebar" || item.mobile).filter(
    (item) => !item.adminOnly || role === "admin"
  );
}
