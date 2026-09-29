"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import {
  Users,
  UserCheck,
  BookOpen,
  UsersRound,
  FileSignature,
  KeyRound,
  ListChecks,
  LogOut,
  ChevronRight,
  Shield,
  Download,
  SlidersHorizontal,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/card";

interface ProfileClientProps {
  userName: string;
  userEmail: string;
  isAdmin: boolean;
}

const menuItems = [
  {
    href: "/patients",
    label: "Meine Patient:innen",
    icon: Users,
    description: "Patient:innen verwalten",
  },
  {
    href: "/supervisors",
    label: "Meine Supervisor:innen",
    icon: UserCheck,
    description: "Supervisor:innen verwalten",
  },
  {
    href: "/supervision",
    label: "Meine Supervisionen",
    icon: BookOpen,
    description: "Supervisionen bearbeiten und löschen",
  },
  {
    href: "/groups",
    label: "Meine Gruppen",
    icon: UsersRound,
    description: "Gruppenfachkunde verwalten",
  },
  {
    href: "/nachweis",
    label: "Nachweis drucken",
    icon: FileSignature,
    description: "Sitzungsliste mit Unterschriftsfeldern je Zeitraum und Supervisor:in",
  },
  {
    href: "/checklist",
    label: "Checkliste & Tipps",
    icon: ListChecks,
    description: "Vor dem Start, Routinen, Spar-Tipps",
  },
  {
    href: "/profile/regeln",
    label: "Meine Ausbildungsregeln",
    icon: SlidersHorizontal,
    description: "Stundenziele und Verhältnis persönlich anpassen",
  },
  {
    href: "/profile/password",
    label: "Passwort ändern",
    icon: KeyRound,
    description: "Anmeldepasswort ändern",
  },
  {
    href: "/profile/data",
    label: "Meine Daten",
    icon: Download,
    description: "CSV- und JSON-Export, Account löschen",
  },
];

export function ProfileClient({ userName, userEmail, isAdmin }: ProfileClientProps) {
  const items = isAdmin
    ? [...menuItems, { href: "/admin", label: "Administration", icon: Shield, description: "Einladungen, Accounts, Ausbildungsprofil" }]
    : menuItems;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title="Mein Profil" />

      <Card>
        <p className="font-medium text-foreground">{userName}</p>
        <p className="text-sm text-muted-foreground">{userEmail}</p>
      </Card>

      <Card className="gap-0 divide-y divide-border py-2">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="-mx-4 flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted"
          >
            <div className="rounded-lg bg-primary-soft p-2 text-primary">
              <item.icon size={20} aria-hidden="true" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            <ChevronRight size={16} className="text-muted-foreground/60" aria-hidden="true" />
          </Link>
        ))}
      </Card>

      <Card asChild>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/auth/login" })}
          className="w-full flex-row items-center gap-3 text-left transition-colors hover:bg-destructive-soft"
        >
          <div className="rounded-lg bg-destructive-soft p-2 text-destructive">
            <LogOut size={20} aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-medium text-destructive">Abmelden</p>
            <p className="text-xs text-muted-foreground">Sitzung beenden</p>
          </div>
        </button>
      </Card>
    </div>
  );
}
