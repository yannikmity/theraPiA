// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFeedbackStore, type FeedbackStore } from "../feedback/store";
import type { FeedbackInput } from "../feedback/model";

// Durchreichende Hülle um node:fs/promises: Einzelne Tests hängen sich per Hook vor unlink/writeFile, um
// gleichzeitiges Löschen und Schreibfehler nachzustellen. Ohne Hook verhält sich alles wie das echte Modul.
type Hook = (target: string) => Promise<void> | void;
const fsHooks: { unlink: Hook | null; writeFile: Hook | null; readFile: Hook | null } = { unlink: null, writeFile: null, readFile: null };
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  const unlink: typeof actual.unlink = async (target) => {
    await fsHooks.unlink?.(String(target));
    return actual.unlink(target);
  };
  const writeFile = (async (target: Parameters<typeof actual.writeFile>[0], ...rest: unknown[]) => {
    await fsHooks.writeFile?.(String(target));
    return (actual.writeFile as (...args: unknown[]) => Promise<void>)(target, ...rest);
  }) as typeof actual.writeFile;
  const readFile = (async (target: Parameters<typeof actual.readFile>[0], ...rest: unknown[]) => {
    await fsHooks.readFile?.(String(target));
    return (actual.readFile as (...args: unknown[]) => Promise<unknown>)(target, ...rest);
  }) as typeof actual.readFile;
  return { ...actual, default: { ...actual, unlink, writeFile, readFile }, unlink, writeFile, readFile };
});

function errnoError(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: simuliert`), { code });
}

// 1x1-PNG (transparent) – beginnt mit den PNG-Magic-Bytes.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);
const userA = { id: "11111111-1111-4111-8111-111111111111", email: "a@example.com", name: "PiA A" };
const userB = { id: "22222222-2222-4222-8222-222222222222", email: "b@example.com", name: "PiA B" };

function input(overrides: Partial<FeedbackInput> = {}): FeedbackInput {
  return {
    page: "/patients/33333333-3333-4333-8333-333333333333",
    element: "Sitzung bearbeiten",
    selector: "main > div:nth-of-type(2) > button",
    sentiment: "negativ",
    text: "Der Knopf ist auf dem Handy nicht erreichbar.\n\nZweiter Absatz: \"Zitat\".",
    viewport: "390x844",
    userAgent: "Mozilla/5.0 (Test)",
    screenshotPng: PNG,
    ...overrides,
  };
}

describe("Feedback-Store", () => {
  let dir: string;
  let store: FeedbackStore;
  let tick = 0;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "therapia-feedback-"));
    tick = 0;
    store = createFeedbackStore(path.join(dir, "feedback"), {
      now: () => new Date(2026, 8, 26, 14, 30, tick++),
      randomId: () => "0123abcd",
    });
  });
  afterEach(async () => {
    fsHooks.unlink = null;
    fsHooks.writeFile = null;
    fsHooks.readFile = null;
    await rm(dir, { recursive: true, force: true });
  });

  it("legt den Ordner an und schreibt Markdown mit Frontmatter plus PNG", async () => {
    const meta = await store.save(input(), userA);
    expect(meta).toEqual({
      id: "20260926-143000-0123abcd",
      userId: userA.id,
      userEmail: "a@example.com",
      userName: "PiA A",
      page: "/patients/33333333-3333-4333-8333-333333333333",
      element: "Sitzung bearbeiten",
      selector: "main > div:nth-of-type(2) > button",
      sentiment: "negativ",
      screenshot: true,
      viewport: "390x844",
      userAgent: "Mozilla/5.0 (Test)",
      createdAt: new Date(2026, 8, 26, 14, 30, 0).toISOString(),
    });
    expect((await readdir(path.join(dir, "feedback"))).sort()).toEqual([
      "20260926-143000-0123abcd.md",
      "20260926-143000-0123abcd.png",
    ]);
    const md = await readFile(path.join(dir, "feedback", "20260926-143000-0123abcd.md"), "utf8");
    expect(md.startsWith('---\nid: "20260926-143000-0123abcd"\nuser_id: "' + userA.id + '"\n')).toBe(true);
    expect(md).toContain('sentiment: "negativ"');
    expect(md).toContain('screenshot: "20260926-143000-0123abcd.png"');
    expect(md).toContain("\n---\n# Feedback – Stört mich\n\nDer Knopf ist auf dem Handy nicht erreichbar.");
    expect(md).toContain("\n![Screenshot](20260926-143000-0123abcd.png)\n");
    expect(await readFile(path.join(dir, "feedback", "20260926-143000-0123abcd.png"))).toEqual(PNG);
  });

  it("ohne Screenshot: keine PNG, screenshot leer, kein Bildverweis", async () => {
    const meta = await store.save(input({ screenshotPng: null }), userA);
    expect(meta.screenshot).toBe(false);
    expect(await readdir(path.join(dir, "feedback"))).toEqual(["20260926-143000-0123abcd.md"]);
    expect(await readFile(path.join(dir, "feedback", "20260926-143000-0123abcd.md"), "utf8")).not.toContain("![Screenshot]");
  });

  it("list liefert neueste zuerst, get liefert Text ohne Überschrift und Bildzeile", async () => {
    const first = await store.save(input({ text: "eins" }), userA);
    const second = await store.save(input({ text: "zwei", screenshotPng: null }), userB);
    expect((await store.list()).map((m) => m.id)).toEqual([second.id, first.id]);
    expect(await store.get(first.id)).toEqual({ meta: first, text: "eins" });
    expect((await store.get(second.id))?.text).toBe("zwei");
  });

  it("erhält den Text mit Absätzen und Anführungszeichen unverändert", async () => {
    const meta = await store.save(input(), userA);
    expect((await store.get(meta.id))?.text).toBe(input().text);
  });

  it("list ist leer, wenn der Ordner noch nicht existiert", async () => {
    expect(await store.list()).toEqual([]);
  });

  it("weist fremde und traversierende IDs ab, bevor ein Pfad entsteht", async () => {
    const meta = await store.save(input(), userA);
    expect(await store.readScreenshot(meta.id)).toEqual(PNG);
    for (const bad of ["../x", "20260926-143000-0123abcd/../../etc/passwd", "20260926-143000-0123ABCD", "", "x.png"]) {
      expect(await store.readScreenshot(bad)).toBeNull();
      expect(await store.get(bad)).toBeNull();
    }
    expect(await store.readScreenshot("20260926-143000-ffffffff")).toBeNull();
  });

  it("readScreenshot liefert null, wenn die Datei gerade verschwunden ist, reicht andere Lesefehler aber weiter", async () => {
    const meta = await store.save(input(), userA);
    fsHooks.readFile = (target) => {
      if (target.endsWith(".png")) throw errnoError("ENOENT");
    };
    expect(await store.readScreenshot(meta.id)).toBeNull();
    fsHooks.readFile = (target) => {
      if (target.endsWith(".png")) throw errnoError("EACCES");
    };
    await expect(store.readScreenshot(meta.id)).rejects.toMatchObject({ code: "EACCES" });
  });

  it("deleteForUser löscht nur die Dateien dieser Person (MD und PNG)", async () => {
    const a1 = await store.save(input(), userA);
    const b1 = await store.save(input(), userB);
    const a2 = await store.save(input({ screenshotPng: null }), userA);
    expect(await store.deleteForUser(userA.id)).toBe(2);
    expect((await readdir(path.join(dir, "feedback"))).sort()).toEqual([`${b1.id}.md`, `${b1.id}.png`]);
    expect(await store.get(a1.id)).toBeNull();
    expect(await store.get(a2.id)).toBeNull();
    expect(await store.deleteForUser("99999999-9999-4999-8999-999999999999")).toBe(0);
  });

  it("deleteForUser löscht auch beschädigte Dateien der Person (unbekanntes Sentiment)", async () => {
    const b1 = await store.save(input(), userB);
    const damaged = "20260926-150000-deadbeef";
    await writeFile(
      path.join(dir, "feedback", `${damaged}.md`),
      `---\nid: "${damaged}"\nuser_id: "${userA.id}"\nsentiment: "kaputt"\nscreenshot: "${damaged}.png"\n---\n# Feedback\n\nText\n`
    );
    await writeFile(path.join(dir, "feedback", `${damaged}.png`), PNG);
    // Datei ohne user_id: gehört niemandem, auch nicht einer leeren userId.
    const orphan = "20260926-150001-cafebabe";
    await writeFile(path.join(dir, "feedback", `${orphan}.md`), `---\nid: "${orphan}"\n---\n# Feedback\n`);
    expect(await store.deleteForUser("")).toBe(0);
    expect(await store.deleteForUser(userA.id)).toBe(1);
    expect((await readdir(path.join(dir, "feedback"))).sort()).toEqual([`${b1.id}.md`, `${b1.id}.png`, `${orphan}.md`]);
  });

  it("deleteForUser findet auch Dateien mit Windows-Zeilenenden", async () => {
    const id = "20260926-150002-0badf00d";
    const md = `---\nid: "${id}"\nuser_id: "${userA.id}"\nsentiment: "positiv"\nscreenshot: ""\n---\n# Feedback\n\nText\n`.replace(/\n/g, "\r\n");
    await mkdir(path.join(dir, "feedback"), { recursive: true });
    await writeFile(path.join(dir, "feedback", `${id}.md`), md);
    expect((await store.get(id))?.text).toBe("Text");
    expect(await store.deleteForUser(userA.id)).toBe(1);
    expect(await readdir(path.join(dir, "feedback"))).toEqual([]);
  });

  it("deleteForUser bricht nicht ab, wenn eine Datei gleichzeitig schon gelöscht wurde (ENOENT)", async () => {
    const a1 = await store.save(input(), userA);
    const a2 = await store.save(input(), userA);
    // Zwischen Lesen und Löschen verschwindet a2 (MD und PNG) – z. B. durch ein paralleles deleteForUser.
    fsHooks.unlink = async (target) => {
      if (path.basename(target) === `${a2.id}.md`) {
        fsHooks.unlink = null;
        await rm(path.join(dir, "feedback", `${a2.id}.md`));
        await rm(path.join(dir, "feedback", `${a2.id}.png`));
      }
    };
    await expect(store.deleteForUser(userA.id)).resolves.toBe(1);
    expect(await readdir(path.join(dir, "feedback"))).toEqual([]);
    expect(await store.get(a1.id)).toBeNull();
  });

  it("deleteForUser reicht andere Fehler beim Löschen weiter", async () => {
    await store.save(input(), userA);
    fsHooks.unlink = (target) => {
      if (target.endsWith(".md")) throw errnoError("EACCES");
    };
    await expect(store.deleteForUser(userA.id)).rejects.toMatchObject({ code: "EACCES" });
    fsHooks.unlink = (target) => {
      if (target.endsWith(".png")) throw errnoError("EPERM");
    };
    await expect(store.deleteForUser(userA.id)).rejects.toMatchObject({ code: "EPERM" });
  });

  it("save räumt die PNG weg, wenn das Schreiben der Markdown-Datei scheitert", async () => {
    fsHooks.writeFile = (target) => {
      if (target.endsWith(".md")) throw errnoError("ENOSPC");
    };
    await expect(store.save(input(), userA)).rejects.toMatchObject({ code: "ENOSPC" });
    expect(await readdir(path.join(dir, "feedback"))).toEqual([]);
  });

  it("list und get liefern bei verschwundener Datei nichts, reichen andere Lesefehler aber weiter", async () => {
    const meta = await store.save(input(), userA);
    fsHooks.readFile = (target) => {
      if (target.endsWith(".md")) throw errnoError("ENOENT");
    };
    expect(await store.list()).toEqual([]);
    expect(await store.get(meta.id)).toBeNull();
    fsHooks.readFile = (target) => {
      if (target.endsWith(".md")) throw errnoError("EACCES");
    };
    await expect(store.list()).rejects.toMatchObject({ code: "EACCES" });
    await expect(store.get(meta.id)).rejects.toMatchObject({ code: "EACCES" });
  });
});
