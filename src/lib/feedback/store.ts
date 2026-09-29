import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { format } from "date-fns";
import { parseFrontmatter, serializeFrontmatter, type FrontmatterValue } from "./frontmatter";
import {
  isFeedbackId,
  SENTIMENTS,
  SENTIMENT_LABELS,
  type FeedbackInput,
  type FeedbackItem,
  type FeedbackMeta,
  type FeedbackUser,
  type Sentiment,
} from "./model";

// Ein Feedback = eine Markdown-Datei (Frontmatter + Text) und optional ein PNG daneben. Kein Datenbankzugriff,
// das Verzeichnis wird injiziert – so ist der Store ohne Postgres testbar und in Produktion ein Volume.
export interface FeedbackStore {
  save(input: FeedbackInput, user: FeedbackUser): Promise<FeedbackMeta>;
  /** Neueste zuerst (IDs beginnen mit dem Zeitstempel). Dateien, die nicht dem Muster entsprechen, werden ignoriert. */
  list(): Promise<FeedbackMeta[]>;
  get(id: string): Promise<FeedbackItem | null>;
  /** PNG-Inhalt – null bei ungültiger ID oder fehlender Datei (auch wenn sie gerade gelöscht wird). Andere Lesefehler werden geworfen. */
  readScreenshot(id: string): Promise<Buffer | null>;
  /** Löscht alle Feedbacks (MD + PNG) einer Person, liefert die Anzahl. Für die Account-Löschung. */
  deleteForUser(userId: string): Promise<number>;
}

export interface FeedbackStoreDeps {
  now?: () => Date;
  randomId?: () => string;
}

const HEADING = /^# [^\n]*\n\n/;
const SCREENSHOT_LINE = /\n\n!\[Screenshot\]\([^)]*\)\n?$/;

function str(value: FrontmatterValue | undefined): string {
  if (value === undefined) return "";
  return typeof value === "string" ? value : String(value);
}

function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

function metaFromFrontmatter(id: string, fm: Record<string, FrontmatterValue>): FeedbackMeta | null {
  const sentiment = str(fm.sentiment);
  if (!(SENTIMENTS as readonly string[]).includes(sentiment)) return null;
  return {
    id,
    userId: str(fm.user_id),
    userEmail: str(fm.user_email),
    userName: str(fm.user_name),
    page: str(fm.page),
    element: str(fm.element),
    selector: str(fm.selector),
    sentiment: sentiment as Sentiment,
    screenshot: str(fm.screenshot) !== "",
    viewport: str(fm.viewport),
    userAgent: str(fm.user_agent),
    createdAt: str(fm.created_at),
  };
}

export function createFeedbackStore(dir: string, deps: FeedbackStoreDeps = {}): FeedbackStore {
  const now = deps.now ?? (() => new Date());
  const randomId = deps.randomId ?? (() => randomBytes(4).toString("hex"));
  // dir kommt zur Laufzeit aus FEEDBACK_DIR; ohne turbopackIgnore verfolgt der Build-Tracer das ganze Projekt
  // (inkl. .env, .git) in .next/standalone.
  const file = (id: string, ext: "md" | "png") => path.join(/*turbopackIgnore: true*/ dir, `${id}.${ext}`);

  // Nur eine verschwundene Datei (paralleles Löschen) heißt „kein Feedback“. Andere Lesefehler (z. B. EACCES)
  // werden weitergereicht – sonst wäre die Admin-Liste still leer und jede Detailseite ein 404.
  async function readMarkdown(id: string): Promise<string | null> {
    try {
      return await readFile(file(id, "md"), "utf8");
    } catch (error) {
      if (isEnoent(error)) return null;
      throw error;
    }
  }

  async function readMeta(id: string): Promise<FeedbackMeta | null> {
    const raw = await readMarkdown(id);
    return raw === null ? null : metaFromFrontmatter(id, parseFrontmatter(raw).meta);
  }

  // Löschen, das eine schon verschwundene Datei (paralleles Löschen) nicht als Fehler wertet. true = gelöscht.
  async function removeIfPresent(target: string): Promise<boolean> {
    try {
      await unlink(target);
      return true;
    } catch (error) {
      if (isEnoent(error)) return false;
      throw error;
    }
  }

  async function ids(): Promise<string[]> {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      if (isEnoent(error)) return [];
      throw error;
    }
    return names
      .filter((name) => name.endsWith(".md"))
      .map((name) => name.slice(0, -3))
      .filter(isFeedbackId)
      .sort()
      .reverse();
  }

  return {
    async save(input, user) {
      await mkdir(dir, { recursive: true });
      const created = now();
      const id = `${format(created, "yyyyMMdd-HHmmss")}-${randomId()}`;
      // PNG zuerst: eine MD-Datei verweist nie auf ein Bild, das nicht existiert. flag "wx": nie überschreiben.
      let screenshot = "";
      if (input.screenshotPng) {
        await writeFile(file(id, "png"), input.screenshotPng, { flag: "wx" });
        screenshot = `${id}.png`;
      }
      const frontmatter: Record<string, string> = {
        id,
        user_id: user.id,
        user_email: user.email,
        user_name: user.name,
        page: input.page,
        element: input.element,
        selector: input.selector,
        sentiment: input.sentiment,
        screenshot,
        viewport: input.viewport,
        user_agent: input.userAgent,
        created_at: created.toISOString(),
      };
      const body =
        `# Feedback – ${SENTIMENT_LABELS[input.sentiment]}\n\n${input.text}\n` +
        (screenshot ? `\n![Screenshot](${screenshot})\n` : "");
      try {
        await writeFile(file(id, "md"), serializeFrontmatter(frontmatter) + body, { encoding: "utf8", flag: "wx" });
      } catch (error) {
        // Ohne MD-Datei gehört die PNG zu niemandem – deleteForUser fände sie nie. Aufräumen, Fehler weiterreichen.
        if (screenshot) await removeIfPresent(file(id, "png")).catch(() => undefined);
        throw error;
      }
      return metaFromFrontmatter(id, frontmatter) as FeedbackMeta;
    },

    async list() {
      const result: FeedbackMeta[] = [];
      for (const id of await ids()) {
        const meta = await readMeta(id);
        if (meta) result.push(meta);
      }
      return result;
    },

    async get(id) {
      if (!isFeedbackId(id)) return null;
      const raw = await readMarkdown(id);
      if (raw === null) return null;
      const { meta, body } = parseFrontmatter(raw);
      const parsed = metaFromFrontmatter(id, meta);
      if (!parsed) return null;
      const text = body.replace(HEADING, "").replace(SCREENSHOT_LINE, "").replace(/\n$/, "");
      return { meta: parsed, text };
    },

    // Direkt lesen statt erst prüfen, dann lesen: Verschwindet die Datei dazwischen (Account-Löschung), wäre das ein
    // ENOENT im Route-Handler und damit 500 – so ist es schlicht „kein Screenshot“.
    async readScreenshot(id) {
      if (!isFeedbackId(id)) return null;
      try {
        return await readFile(file(id, "png"));
      } catch (error) {
        if (isEnoent(error)) return null;
        throw error;
      }
    },

    async deleteForUser(userId) {
      // Zuordnung über das rohe Frontmatter, nicht über metaFromFrontmatter: Auch eine beschädigte Datei
      // (z. B. unbekanntes Sentiment) gehört der Person und muss mit dem Account verschwinden.
      // Leere userId: nie auf Dateien ohne user_id passen lassen.
      if (!userId) return 0;
      let count = 0;
      for (const id of await ids()) {
        const raw = await readMarkdown(id);
        if (raw === null) continue;
        if (str(parseFrontmatter(raw).meta.user_id) !== userId) continue;
        const removed = await removeIfPresent(file(id, "md"));
        await removeIfPresent(file(id, "png"));
        if (removed) count++;
      }
      return count;
    },
  };
}
