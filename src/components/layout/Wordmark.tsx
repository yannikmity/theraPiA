import Link from "next/link";

export function Wordmark() {
  return (
    <Link href="/" className="text-lg font-bold text-foreground" aria-label="theraPiA – zum Dashboard">
      Thera<span className="text-primary">PIA</span>
    </Link>
  );
}
