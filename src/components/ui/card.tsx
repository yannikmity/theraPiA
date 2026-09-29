import * as React from "react";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

interface CardProps extends React.ComponentProps<"div"> {
  /** Rendert die Karte als das Kind-Element (z. B. <Link>), damit ganze Karten anklickbar sind. */
  asChild?: boolean;
}

function Card({ className, asChild = false, ...props }: CardProps) {
  const Comp = asChild ? Slot.Root : "div";
  return (
    <Comp
      data-slot="card"
      className={cn(
        "flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xs",
        className
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-header" className={cn("grid gap-1", className)} {...props} />;
}

function CardTitle({ className, asChild = false, ...props }: React.ComponentProps<"h2"> & { asChild?: boolean }) {
  // asChild: z. B. <h1> als Seitentitel auf Auth-Seiten, die sonst keine Seitenüberschrift haben.
  const Comp = asChild ? Slot.Root : "h2";
  return <Comp data-slot="card-title" className={cn("text-lg leading-none font-semibold", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("flex flex-col gap-3", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-footer" className={cn("flex items-center gap-2", className)} {...props} />;
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };
