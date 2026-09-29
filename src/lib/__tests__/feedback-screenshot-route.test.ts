// @vitest-environment node
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createFeedbackStore, type FeedbackStore } from "../feedback/store";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; role: string } },
  store: undefined as unknown,
}));
vi.mock("@/lib/auth", () => ({ auth: async () => state.session }));
vi.mock("@/lib/feedback", () => ({ getFeedbackStore: () => state.store as FeedbackStore }));

import { GET } from "@/app/api/feedback/[id]/screenshot/route";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);
const admin = { user: { id: "11111111-1111-4111-8111-111111111111", role: "admin" } };
const pia = { user: { id: "22222222-2222-4222-8222-222222222222", role: "pia" } };
const feedbackUser = { id: pia.user.id, email: "b@example.com", name: "PiA B" };

const get = (id: string) => GET(new Request(`http://localhost:3200/api/feedback/${id}/screenshot`), { params: Promise.resolve({ id }) });

describe("GET /api/feedback/{id}/screenshot", () => {
  let dir: string;
  let store: FeedbackStore;
  let id: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "therapia-screenshot-route-"));
    store = createFeedbackStore(path.join(dir, "feedback"));
    state.store = store;
    state.session = admin;
    id = (
      await store.save(
        { page: "/", element: "x", selector: "main", sentiment: "positiv", text: "gut", viewport: "", userAgent: "", screenshotPng: PNG },
        feedbackUser
      )
    ).id;
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("antwortet 401 ohne Sitzung und 403 für Nicht-Admins", async () => {
    state.session = null;
    expect((await get(id)).status).toBe(401);
    state.session = pia;
    expect((await get(id)).status).toBe(403);
  });

  it("liefert das PNG mit Inhaltstyp, inline-Disposition und ohne Caching", async () => {
    const res = await get(id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-disposition")).toBe(`inline; filename="${id}.png"`);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(PNG);
  });

  it("antwortet 404 bei unbekannter oder ungültiger ID", async () => {
    expect((await get("20260926-143000-ffffffff")).status).toBe(404);
    expect((await get("../etc/passwd")).status).toBe(404);
  });

  it("antwortet 404, wenn das Feedback zwischen Listen und Abruf gelöscht wurde", async () => {
    await store.deleteForUser(feedbackUser.id);
    const res = await get(id);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Nicht gefunden" });
  });

  it("antwortet 500 ohne Details, wenn das Lesen aus anderem Grund scheitert", async () => {
    state.store = {
      ...store,
      readScreenshot: async () => {
        throw Object.assign(new Error("EACCES: simuliert"), { code: "EACCES" });
      },
    } satisfies FeedbackStore;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await get(id);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Ein Fehler ist aufgetreten" });
    } finally {
      error.mockRestore();
    }
  });
});
