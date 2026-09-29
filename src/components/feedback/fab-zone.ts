// Zone des schwebenden Feedback-Knopfs (FAB) unten rechts: am Handy über der Bottom-Navigation (z-50, 56 px + Safe-Area),
// ab md in der Ecke. AppShell hält am Ende des Inhalts mit FAB_CLEARANCE so viel Platz frei, dass ein Speichern-Knopf am
// Formularende nie unter dem FAB liegt (#49) – auf allen Seiten, ohne Sonderfälle je Formular. Beide Werte hier, damit
// Knopf und Freihaltung nicht auseinanderlaufen (AppShell.test.tsx rechnet nach; scripts/fab-clearance.mjs misst im Browser).
export const FAB_CORNER = "bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6";
// Unterkante 4.5rem + Höhe 3rem (size="lg": h-12) + 1rem Luft = 8.5rem; ab md: 1.5rem + 3rem + 1rem = 5.5rem (pb-22).
export const FAB_CLEARANCE = "pb-[calc(8.5rem+env(safe-area-inset-bottom))] md:pb-22";
// Rechter Abstand des FAB: im Querformat liegen rechts Notch bzw. abgerundete Ecke (safe-area-inset-right, #56).
export const FAB_RIGHT = "right-[max(1rem,env(safe-area-inset-right))] md:right-[max(1.5rem,env(safe-area-inset-right))]";
// Feedback-Panel (#56): seitlich wie der Knopf innerhalb der Safe-Areas. Die Maximalhöhe zieht beide Safe-Areas ab –
// sonst ragte die Oberkante in voller Höhe um „Safe-Area unten − 1,5rem“ (≈ 10 px) aus dem Bild. Oben bleiben damit
// 1,5rem + Safe-Area frei (am Handy: Unterkante 4.5rem + Safe-Area unten, siehe FAB_CORNER).
export const FAB_PANEL =
  "left-[max(0.75rem,env(safe-area-inset-left))] right-[max(0.75rem,env(safe-area-inset-right))] max-h-[calc(100svh_-_6rem_-_env(safe-area-inset-top)_-_env(safe-area-inset-bottom))] md:left-auto md:right-[max(1.5rem,env(safe-area-inset-right))]";
