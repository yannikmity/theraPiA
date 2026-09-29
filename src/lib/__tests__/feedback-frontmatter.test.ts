import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "../feedback/frontmatter";

describe("Feedback-Frontmatter", () => {
  it("schreibt je Feld eine Zeile mit JSON-kodiertem Wert (gültiges YAML)", () => {
    expect(serializeFrontmatter({ id: "x", n: 2, ok: true, text: 'a "b"\nc' })).toBe(
      '---\nid: "x"\nn: 2\nok: true\ntext: "a \\"b\\"\\nc"\n---\n'
    );
  });

  it("liest Frontmatter und Body zurück, auch mit Doppelpunkt und Zeilenumbruch im Wert", () => {
    const text = serializeFrontmatter({ page: "/a:b", note: "x\ny" }) + "Body\n\nmehr\n";
    expect(parseFrontmatter(text)).toEqual({ meta: { page: "/a:b", note: "x\ny" }, body: "Body\n\nmehr\n" });
  });

  it("liefert leere Metadaten ohne Frontmatter oder ohne Abschluss", () => {
    expect(parseFrontmatter("nur Text")).toEqual({ meta: {}, body: "nur Text" });
    expect(parseFrontmatter("---\nid: 1\nkein Ende")).toEqual({ meta: {}, body: "---\nid: 1\nkein Ende" });
  });

  it("übernimmt nicht-JSON-Werte als Text und ignoriert Zeilen ohne Doppelpunkt", () => {
    expect(parseFrontmatter("---\nfrei: hallo welt\nkaputt\n---\n")).toEqual({ meta: { frei: "hallo welt" }, body: "" });
  });

  it("liest Frontmatter auch mit Windows-Zeilenenden und liefert den Body mit LF", () => {
    const crlf = (serializeFrontmatter({ user_id: "u1", sentiment: "positiv" }) + "# Feedback\n\nText\n").replace(/\n/g, "\r\n");
    expect(parseFrontmatter(crlf)).toEqual({ meta: { user_id: "u1", sentiment: "positiv" }, body: "# Feedback\n\nText\n" });
  });
});
