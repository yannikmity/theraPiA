"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { trackPageview } from "@/lib/analytics/track";

// Umami-Einbindung mit zwei Besonderheiten: Konfiguration kommt als Props (zur Laufzeit
// vom Server, nicht aus NEXT_PUBLIC_-Variablen) und Pageviews laufen manuell (data-auto-track="false"), damit
// jede URL vor dem Senden durch sanitizePath geht. data-do-not-track respektiert die Browser-Einstellung,
// data-exclude-search lässt Query-Strings weg (zweite Sicherung neben dem Sanitizer).
// Die Nonce kommt vom Server (UmamiLoader, aus dem Proxy) – im Browser gibt next/script sonst keine Nonce an das
// eingefügte Script.
export function UmamiScript({ scriptUrl, websiteId, nonce }: { scriptUrl: string; websiteId: string; nonce?: string }) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) trackPageview();
  }, [ready, pathname]);

  return (
    <Script
      src={scriptUrl}
      nonce={nonce}
      data-website-id={websiteId}
      data-auto-track="false"
      data-do-not-track="true"
      data-exclude-search="true"
      strategy="afterInteractive"
      onLoad={() => setReady(true)}
    />
  );
}
