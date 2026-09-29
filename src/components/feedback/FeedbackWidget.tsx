"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CircleCheck, Crosshair, MessageSquarePlus, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { track } from "@/lib/analytics/track";
import { FEEDBACK_TEXT_MAX, SCREENSHOT_DATA_URL_MAX, SENTIMENTS, SENTIMENT_LABELS, type Sentiment } from "@/lib/feedback/model";
import { captureViewport, cssPath, isWidgetElement, labelOf, viewportSize } from "./capture";
import { FAB_CORNER, FAB_PANEL, FAB_RIGHT } from "./fab-zone";
import { SENTIMENT_ICONS } from "./sentiment";

// In-App-Feedback: schwebender Knopf → Element anpinnen
// (Maus, Touch oder Tastatur) → Viewport-Screenshot → Panel mit Sentiment und Text → „Direkt speichern“.
// Die Person kommt serverseitig aus der Sitzung; userName ist nur Anzeige. Alle Teile tragen
// data-feedback-widget, damit Pick-Modus und Screenshot sie ignorieren.
type Mode = "idle" | "picking" | "panel";
type ShotState = "busy" | "ready" | "unavailable" | "too-large";
type Status = "input" | "saving" | "done";
interface Pin {
  label: string;
  selector: string;
  page: string;
}

const SAVE_ERROR = "Speichern fehlgeschlagen. Bitte noch einmal versuchen.";

export function FeedbackWidget({ userName }: { userName: string }) {
  const [mode, setMode] = useState<Mode>("idle");
  const [pin, setPin] = useState<Pin | null>(null);
  const [sentiment, setSentiment] = useState<Sentiment | "">("");
  const [text, setText] = useState("");
  const [shot, setShot] = useState<string | null>(null);
  const [shotOn, setShotOn] = useState(true);
  const [shotState, setShotState] = useState<ShotState>("busy");
  const [status, setStatus] = useState<Status>("input");
  const [savedWithShot, setSavedWithShot] = useState(false);
  const [error, setError] = useState("");
  const fabRef = useRef<HTMLButtonElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLDivElement>(null);
  // Zählt Anpinnen/Schließen: ein Screenshot, der erst nach einem neuen Pin fertig wird, wird verworfen.
  const captureRun = useRef(0);

  const reset = useCallback(() => {
    captureRun.current += 1;
    setMode("idle");
    setPin(null);
    setSentiment("");
    setText("");
    setShot(null);
    setShotOn(true);
    setStatus("input");
    setError("");
    // Fokus zurück zum Auslöser, sobald er wieder gerendert ist.
    setTimeout(() => fabRef.current?.focus(), 0);
  }, []);

  const startPicking = useCallback(() => {
    setPin(null);
    setStatus("input");
    setError("");
    setMode("picking");
    track("feedback_opened");
  }, []);

  const pinElement = useCallback((el: Element, label?: string) => {
    const run = ++captureRun.current;
    setPin({ label: label ?? labelOf(el), selector: cssPath(el), page: window.location.pathname });
    setMode("panel");
    setStatus("input");
    setSentiment("");
    setText("");
    setError("");
    setShot(null);
    setShotOn(true);
    setShotState("busy");
    // Screenshot sofort beim Anpinnen: der Seitenzustand ist dann genau das, was die Person sieht.
    captureViewport(el).then((dataUrl) => {
      if (run !== captureRun.current) return;
      if (!dataUrl) return setShotState("unavailable");
      if (dataUrl.length > SCREENSHOT_DATA_URL_MAX) return setShotState("too-large");
      setShot(dataUrl);
      setShotState("ready");
    });
  }, []);

  useEffect(() => {
    if (mode !== "picking") return;
    // Der FAB verschwindet mit dem Start – Fokus auf die Hinweisleiste statt ins Leere (body).
    hintRef.current?.focus();
    const highlight = (el: Element | null) => {
      const box = highlightRef.current;
      if (!box) return;
      if (!el || isWidgetElement(el) || el === document.body || el === document.documentElement) {
        box.style.display = "none";
        return;
      }
      const r = el.getBoundingClientRect();
      Object.assign(box.style, { display: "block", left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    };
    const onMove = (e: MouseEvent) => highlight(e.target as Element | null);
    const onFocus = () => highlight(document.activeElement);
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element | null;
      if (!el || isWidgetElement(el)) return;
      e.preventDefault();
      e.stopPropagation();
      pinElement(el);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMode("idle");
      } else if (e.key === "Enter") {
        const el = document.activeElement;
        if (!el || isWidgetElement(el) || el === document.body || el === document.documentElement) return;
        e.preventDefault();
        pinElement(el);
      }
    };
    // pointerdown abfangen: sonst öffnet ein <select> sein Menü, ein Feld bekommt den Fokus oder Text wird markiert,
    // bevor der Klick das Element anpinnt (#45). Der Klick kommt trotzdem an; die Widget-Leiste bleibt bedienbar.
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target as Element | null;
      if (!el || isWidgetElement(el)) return;
      e.preventDefault();
    };
    const previousCursor = document.body.style.cursor;
    document.body.style.cursor = "crosshair";
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.cursor = previousCursor;
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [mode, pinElement]);

  // Escape schließt das Panel auch, wenn der Fokus außerhalb liegt (z. B. nach einem Klick in die Seite) – nicht
  // während des Speicherns: die laufende Antwort träfe sonst ein zurückgesetztes Widget (#45).
  useEffect(() => {
    if (mode !== "panel" || status === "saving") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        reset();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mode, status, reset]);

  async function save() {
    if (!pin || !text.trim() || !sentiment) return;
    setStatus("saving");
    setError("");
    const payload = {
      page: pin.page,
      element: pin.label,
      selector: pin.selector,
      sentiment,
      text: text.trim(),
      viewport: viewportSize(),
      screenshot: shotOn && shot ? shot : null,
    };
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: string; screenshot?: boolean; error?: string };
      if (!response.ok || !data.id) {
        setError(data.error ?? SAVE_ERROR);
        setStatus("input");
        return;
      }
      setSavedWithShot(data.screenshot === true);
      setStatus("done");
      track("feedback_saved", { sentiment, screenshot: data.screenshot === true });
    } catch {
      setError(SAVE_ERROR);
      setStatus("input");
    }
  }

  // Erweiterungspunkt (genau eine Requirements-Rückfrage per LLM): käme als Schritt
  // zwischen Eingabe und Speichern hierher (zusätzlicher Status "followup", Endpunkt POST /api/feedback/reply).
  // Bewusst nicht gebaut: kein API-Key im Pilot, und Text aus dem Gesundheitskontext darf nicht an einen
  // LLM-Anbieter. Der Flow endet bei „Direkt speichern“.

  return (
    <div data-feedback-widget="" className="print:hidden">
      {mode === "picking" && (
        <div
          ref={highlightRef}
          data-feedback-widget=""
          aria-hidden="true"
          className="pointer-events-none fixed z-[55] hidden rounded border-2 border-primary bg-primary/10"
        />
      )}
      {mode === "picking" && (
        // Unten, wo sonst der FAB sitzt (über der mobilen Bottom-Navigation): Oben würde die Leiste – selbst
        // nicht anpinnbar – Kopfzeile und Seitenüberschrift verdecken.
        <div
          ref={hintRef}
          tabIndex={-1}
          data-feedback-widget=""
          role="group"
          aria-label="Feedback-Auswahl"
          className={`fixed left-1/2 z-[60] flex w-max max-w-[calc(100vw-1.5rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-lg bg-foreground px-3 py-1.5 text-xs text-background shadow-lg md:py-2 md:text-sm ${FAB_CORNER}`}
        >
          <Crosshair className="size-4 shrink-0" aria-hidden="true" />
          <span aria-live="polite">Element antippen, zu dem du Feedback geben willst</span>
          <Button type="button" size="sm" variant="secondary" onClick={() => pinElement(document.querySelector("main") ?? document.body, "Ganze Seite")}>
            Ganze Seite
          </Button>
          <Button type="button" size="sm" variant="ghost" className="text-background hover:bg-background/20 hover:text-background" onClick={() => setMode("idle")}>
            Abbrechen (Esc)
          </Button>
        </div>
      )}
      {mode === "idle" && (
        <Button
          ref={fabRef}
          type="button"
          size="lg"
          data-feedback-widget=""
          aria-label="Feedback geben"
          onClick={startPicking}
          className={`fixed z-[60] rounded-full shadow-lg ${FAB_RIGHT} ${FAB_CORNER}`}
        >
          <MessageSquarePlus aria-hidden="true" /> Feedback
        </Button>
      )}
      {mode === "panel" && pin && (
        <Card
          data-feedback-widget=""
          role="dialog"
          aria-label="Feedback geben"
          className={`fixed z-[60] overflow-y-auto shadow-xl md:w-96 ${FAB_PANEL} ${FAB_CORNER}`}
        >
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 font-medium text-foreground">
              <MessageSquarePlus className="size-4" aria-hidden="true" /> Feedback
            </p>
            <Button type="button" variant="ghost" size="icon-sm" onClick={reset} disabled={status === "saving"} aria-label="Schließen">
              <X />
            </Button>
          </div>
          <div className="rounded-lg bg-muted px-3 py-2 text-xs">
            <span className="text-muted-foreground">zu: </span>
            <span className="font-medium text-foreground">{pin.label}</span>
            <span className="ml-2 font-mono text-muted-foreground">{pin.page}</span>
          </div>
          {userName && <p className="text-xs text-muted-foreground">als {userName}</p>}
          {status === "done" ? (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <CircleCheck className="size-4" aria-hidden="true" /> Danke, festgehalten.
              </p>
              {shotOn && shot && !savedWithShot && (
                <p className="text-xs text-muted-foreground">Der Screenshot wurde nicht gespeichert (zu groß oder ungültig), der Text schon.</p>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={startPicking}>
                  Weiteres Feedback
                </Button>
                <Button type="button" size="sm" onClick={reset}>
                  Fertig
                </Button>
              </div>
            </div>
          ) : (
            <>
              <ToggleGroup
                type="single"
                variant="outline"
                value={sentiment}
                onValueChange={(value) => setSentiment(value as Sentiment | "")}
                aria-label="Art des Feedbacks"
                className="w-full"
              >
                {SENTIMENTS.map((s) => {
                  const Icon = SENTIMENT_ICONS[s];
                  return (
                    <ToggleGroupItem key={s} value={s} className="flex-1 text-xs">
                      <Icon className="size-4" aria-hidden="true" /> {SENTIMENT_LABELS[s]}
                    </ToggleGroupItem>
                  );
                })}
              </ToggleGroup>
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox
                    id="feedback-screenshot"
                    checked={shotOn}
                    onCheckedChange={(value) => setShotOn(value === true)}
                    // Während der Aufnahme abwählbar – sonst hinge Speichern an einer langsamen Aufnahme.
                    disabled={shotState === "unavailable" || shotState === "too-large"}
                  />
                  <Label htmlFor="feedback-screenshot">
                    <Camera className="size-4" aria-hidden="true" /> Screenshot anhängen
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    {shotState === "busy" && "wird aufgenommen …"}
                    {shotState === "unavailable" && "nicht verfügbar"}
                    {shotState === "too-large" && "zu groß, wird nicht angehängt"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Screenshot kann Chiffren zeigen – bei Bedarf abwählen.</p>
                {shotOn && shot && (
                  // eslint-disable-next-line @next/next/no-img-element -- Vorschau einer Data-URL, kein Bild-Optimierer
                  <img src={shot} alt="Vorschau des Screenshots" className="max-h-40 w-full rounded-lg border border-border object-cover object-left-top" />
                )}
              </div>
              <Textarea
                autoFocus
                aria-label="Feedback-Text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={FEEDBACK_TEXT_MAX}
                rows={3}
                placeholder="Was gefällt dir, stört dich oder fehlt hier?"
              />
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={reset} disabled={status === "saving"}>
                  Abbrechen
                </Button>
                <Button
                  type="button"
                  size="sm"
                  loading={status === "saving"}
                  // Solange der Screenshot noch entsteht, würde Speichern ihn stillschweigend weglassen.
                  disabled={!text.trim() || !sentiment || (shotOn && shotState === "busy")}
                  onClick={save}
                >
                  Direkt speichern
                </Button>
              </div>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
