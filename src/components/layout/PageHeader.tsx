import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: ReactNode;
  backHref?: string;
  backLabel?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

// Seitentitel mit optionalem Zurück-Pfeil und Aktionen rechts – ersetzt das in neun Seiten kopierte Muster.
export function PageHeader({ title, backHref, backLabel = "Zurück", subtitle, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {backHref && (
          <Link
            href={backHref}
            aria-label={backLabel}
            className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "shrink-0")}
          >
            <ArrowLeft aria-hidden="true" />
          </Link>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-foreground md:text-2xl">{title}</h1>
          {subtitle && <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
