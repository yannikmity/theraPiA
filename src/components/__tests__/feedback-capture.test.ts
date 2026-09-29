import { describe, it, expect, vi, afterEach } from "vitest";
import { CAPTURE_TIMEOUT_MS, captureViewport, cssPath, isWidgetElement, labelOf, WIDGET_ATTR } from "../feedback/capture";

const toPng = vi.hoisted(() => vi.fn());
vi.mock("html-to-image", () => ({ toPng }));

function mount(html: string): HTMLElement {
  document.body.innerHTML = html;
  return document.body;
}

describe("Feedback-Capture", () => {
  it("baut einen CSS-Pfad mit nth-of-type und stoppt an einer id", () => {
    mount('<main><div><button>A</button><button id="save">B</button></div><div><span>x</span></div></main>');
    expect(cssPath(document.querySelector("span")!)).toBe("main > div:nth-of-type(2) > span");
    expect(cssPath(document.querySelector("button")!)).toBe("main > div:nth-of-type(1) > button:nth-of-type(1)");
    expect(cssPath(document.getElementById("save")!)).toBe("button#save");
  });

  it("begrenzt die Tiefe auf fünf Stufen", () => {
    mount("<main><section><article><div><p><em>tief</em></p></div></article></section></main>");
    expect(cssPath(document.querySelector("em")!)).toBe("section > article > div > p > em");
  });

  it("bevorzugt aria-label und title, kürzt Text auf 80 Zeichen", () => {
    mount(`<button aria-label="Sitzung löschen">X</button><a title="Profil">P</a><p>${"a".repeat(100)}</p><i></i>`);
    expect(labelOf(document.querySelector("button")!)).toBe("Sitzung löschen");
    expect(labelOf(document.querySelector("a")!)).toBe("Profil");
    expect(labelOf(document.querySelector("p")!)).toHaveLength(80);
    expect(labelOf(document.querySelector("i")!)).toBe("i");
  });

  it("erkennt Elemente innerhalb des Widgets über das Datenattribut", () => {
    mount(`<div ${WIDGET_ATTR}=""><button>innen</button></div><button>außen</button>`);
    const [inner, outer] = Array.from(document.querySelectorAll("button"));
    expect(isWidgetElement(inner)).toBe(true);
    expect(isWidgetElement(outer)).toBe(false);
    expect(isWidgetElement(null)).toBe(false);
  });

  it("escapt ids, die kein gültiger Selektor wären (React-useId)", () => {
    mount('<div id=":r1:"><span>x</span></div>');
    const path = cssPath(document.getElementById(":r1:")!);
    expect(path).toBe("div#\\:r1\\:");
    expect(document.querySelector(path)).toBe(document.getElementById(":r1:"));
  });

  describe("captureViewport", () => {
    afterEach(() => {
      toPng.mockReset();
      Object.assign(window, { scrollX: 0, scrollY: 0 });
      document.body.removeAttribute("style");
      document.documentElement.removeAttribute("style");
      vi.useRealTimers();
    });

    it("verschiebt bei gescrollter Seite per Margin (kein transform), damit fixed/sticky am Viewport bleiben", async () => {
      mount("<main><p>Inhalt</p></main>");
      document.body.style.backgroundColor = "rgb(1, 2, 3)";
      Object.assign(window, { scrollX: 7, scrollY: 480 });
      toPng.mockRejectedValue(new Error("kein Rendering in jsdom"));

      expect(await captureViewport(document.querySelector("p")!)).toBeNull();

      expect(toPng).toHaveBeenCalledTimes(1);
      const [node, options] = toPng.mock.calls[0];
      expect(node).toBe(document.body);
      expect(options.width).toBe(window.innerWidth);
      expect(options.height).toBe(window.innerHeight);
      expect(options.style).toEqual({ marginTop: "-480px", marginLeft: "-7px" });
      expect(options.style).not.toHaveProperty("transform");
      expect(options.backgroundColor).toBe("rgb(1, 2, 3)");
      const widget = document.createElement("div");
      widget.setAttribute(WIDGET_ATTR, "");
      expect(options.filter(widget)).toBe(false);
      expect(options.filter(document.querySelector("p"))).toBe(true);
    });

    it("nimmt den html-Hintergrund, wenn body transparent ist", async () => {
      mount("<main><p>Inhalt</p></main>");
      document.documentElement.style.backgroundColor = "rgb(9, 8, 7)";
      toPng.mockRejectedValue(new Error("kein Rendering in jsdom"));
      await captureViewport(document.querySelector("p")!);
      expect(toPng.mock.calls[0][1].backgroundColor).toBe("rgb(9, 8, 7)");
    });

    it("gibt nach CAPTURE_TIMEOUT_MS null zurück, wenn html-to-image hängt", async () => {
      vi.useFakeTimers();
      mount("<main><p>Inhalt</p></main>");
      toPng.mockImplementation(() => new Promise(() => {}));
      let result: string | null | undefined;
      void captureViewport(document.querySelector("p")!).then((value) => (result = value));
      await vi.advanceTimersByTimeAsync(CAPTURE_TIMEOUT_MS - 1);
      expect(result).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect(result).toBeNull();
    });
  });
});
