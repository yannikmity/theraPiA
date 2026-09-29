"use client";

interface SectionHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionHeader({ children, className = "" }: SectionHeaderProps) {
  return (
    <h2 className={`text-xs font-semibold tracking-wide text-muted-foreground uppercase ${className}`}>{children}</h2>
  );
}
