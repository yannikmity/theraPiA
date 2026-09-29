// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFeedbackStore, type FeedbackStore } from "../feedback/store";
import { FEEDBACK_BODY_MAX_BYTES } from "../feedback/model";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string; name: string; role: string } },
  store: undefined as unknown,
}));
vi.mock("@/lib/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/feedback", () => ({ getFeedbackStore: () => state.store as FeedbackStore }));

import { POST } from "@/app/api/feedback/route";

const ENDPOINT = "http://localhost:3200/api/feedback";
const user = { id: "11111111-1111-4111-8111-111111111111", email: "a@example.com", name: "PiA A", role: "pia" };
const payload = { page: "/patients", element: "Speichern", selector: "main > button", sentiment: "wunsch", text: "Bitte Datum vorbelegen." };

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });
}

function chunked(chunks: Uint8Array[]): Request {
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      const chunk = chunks.shift();
      if (chunk) c.enqueue(chunk);
      else c.close();
    },
  });
  return new Request(ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body, duplex: "half" } as RequestInit);
}

describe("POST /api/feedback", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "therapia-feedback-route-"));
    state.store = createFeedbackStore(path.join(dir, "feedback"));
    state.session = { user };
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("antwortet 401 ohne Sitzung", async () => {
    state.session = null;
    expect((await POST(post(JSON.stringify(payload)))).status).toBe(401);
  });

  it("antwortet 415 ohne application/json", async () => {
    expect((await POST(post(JSON.stringify(payload), { "content-type": "text/plain" }))).status).toBe(415);
  });

  it("antwortet 413 bei angekündigt zu großem Body", async () => {
    const res = await POST(post(JSON.stringify(payload), { "content-length": String(FEEDBACK_BODY_MAX_BYTES + 1) }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Anfrage zu groß" });
  });

  it("antwortet 413 bei einem Chunked-Body über der Grenze – ohne Content-Length", async () => {
    const mib = 1024 * 1024;
    const chunks = Array.from({ length: 13 }, () => new Uint8Array(mib).fill(0x20));
    const res = await POST(chunked(chunks));
    expect(res.status).toBe(413);
    expect(await readdir(dir)).toEqual([]); // nichts gespeichert, Ordner nicht einmal angelegt
  });

  it("antwortet 400 bei kaputtem JSON und bei ungültigem Inhalt", async () => {
    const broken = await POST(post("{"));
    expect(broken.status).toBe(400);
    expect(await broken.json()).toEqual({ error: "Ungültiges JSON" });
    const invalid = await POST(post(JSON.stringify({ ...payload, sentiment: "egal" })));
    expect(invalid.status).toBe(400);
  });

  it("speichert ein Feedback ohne Screenshot und nennt die ID", async () => {
    const res = await POST(post(JSON.stringify(payload), { "user-agent": "Test/1.0" }));
    expect(res.status).toBe(200);
    const data = (await res.json()) as { id: string; screenshot: boolean };
    expect(data.screenshot).toBe(false);
    const item = await (state.store as FeedbackStore).get(data.id);
    expect(item?.meta).toMatchObject({ userId: user.id, userEmail: "a@example.com", page: "/patients", userAgent: "Test/1.0" });
    expect(item?.text).toBe("Bitte Datum vorbelegen.");
  });
});
