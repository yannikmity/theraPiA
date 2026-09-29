// Helfer des Feedback-Widgets: Element beschreiben (Label + CSS-Pfad) und den sichtbaren Viewport als PNG
// aufnehmen. Alles fehlertolerant – Feedback muss auch ohne Screenshot gespeichert werden können.

// Jedes gerenderte Widget-Element trägt dieses Attribut: nie anpinnen, nie fotografieren.
export const WIDGET_ATTR = "data-feedback-widget";

export function isWidgetElement(el: Element | null | undefined): boolean {
  return !!el && el.closest(`[${WIDGET_ATTR}]`) !== null;
}

// ids wie React-useId (":r1:") sind ohne Escaping kein gültiger Selektor. CSS.escape fehlt in jsdom –
// dort genügt das Escapen aller Sonderzeichen.
function escapeId(id: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(id);
  return id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

// tag + nth-of-type, maximal fünf Stufen, endet früh an einer id. Reicht, um das „Wo“ eindeutig zu machen.
export function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && parts.length < 5 && node.tagName.toLowerCase() !== "body") {
    const current: Element = node;
    const tag = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`${tag}#${escapeId(current.id)}`);
      break;
    }
    let selector = tag;
    const parent = current.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      if (sameTag.length > 1) selector += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
    }
    parts.unshift(selector);
    node = parent;
  }
  return parts.join(" > ");
}

export function labelOf(el: Element): string {
  const explicit = el.getAttribute("aria-label") || el.getAttribute("title");
  if (explicit) return explicit.trim().slice(0, 80);
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  return (text || el.tagName.toLowerCase()).slice(0, 80);
}

export function viewportSize(): string {
  return `${window.innerWidth}x${window.innerHeight}`;
}

// Rahmenfarbe aus dem Theme (--destructive), damit kein Farbwert im Code steht.
function frameColor(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--destructive").trim();
  return value || "red";
}

function drawFrame(dataUrl: string, rect: DOMRect, pixelRatio: number): Promise<string> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(dataUrl);
        ctx.drawImage(image, 0, 0);
        ctx.strokeStyle = frameColor();
        ctx.lineWidth = Math.max(2, 3 * pixelRatio);
        ctx.strokeRect(rect.left * pixelRatio, rect.top * pixelRatio, rect.width * pixelRatio, rect.height * pixelRatio);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve(dataUrl);
      }
    };
    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

// html-to-image kennt weder Timeout noch Abbruch. Hängt die Aufnahme (z. B. an einer Ressource), gibt das
// Widget nach dieser Zeit auf und speichert ohne Screenshot.
export const CAPTURE_TIMEOUT_MS = 10_000;

// Hintergrund für den Bildbereich unterhalb des verschobenen body-Kastens: body, sonst html.
function pageBackground(): string {
  const transparent = (value: string) => !value || value === "transparent" || value === "rgba(0, 0, 0, 0)";
  const body = getComputedStyle(document.body).backgroundColor;
  if (!transparent(body)) return body;
  const root = getComputedStyle(document.documentElement).backgroundColor;
  return transparent(root) ? "" : root;
}

// Nur der sichtbare Ausschnitt (nicht die Scrollhöhe), ohne Widget-Elemente, Ziel-Element umrahmt.
// html-to-image wird dynamisch geladen; jeder Fehler (CSP, fremde Bilder, Speicher) oder das Überschreiten
// von CAPTURE_TIMEOUT_MS ergibt null.
export async function captureViewport(target: Element): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), CAPTURE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([capture(target), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function capture(target: Element): Promise<string | null> {
  try {
    const { toPng } = await import("html-to-image");
    const rect = target.getBoundingClientRect();
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const dataUrl = await toPng(document.body, {
      pixelRatio,
      width: window.innerWidth,
      height: window.innerHeight,
      // Verschiebung per negativem Margin statt transform: ein transform auf body wäre Containing Block für
      // position:fixed (Sidebar, Bottom-Navigation) und verschöbe sie mit; so bleiben fixed am Viewport und
      // sticky (mobiler Header) klebt oben wie im Browser. Der body-Kasten endet dann vor dem Bildrand –
      // der Hintergrund kommt daher als Canvas-Farbe dazu.
      style: { marginTop: `${-window.scrollY}px`, marginLeft: `${-window.scrollX}px` },
      backgroundColor: pageBackground() || undefined,
      filter: (node) => !(node instanceof Element && node.hasAttribute(WIDGET_ATTR)),
      cacheBust: true,
    });
    return await drawFrame(dataUrl, rect, pixelRatio);
  } catch {
    return null;
  }
}
