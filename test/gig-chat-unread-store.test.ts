import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * v1.47.0 — the shared unread-count store behind the GigCard chat badges.
 *
 * The store batches every subscribed gig into ONE request. Node has no
 * `window`, so the globals are stubbed to exercise the browser code path, and
 * each test re-imports the module for fresh state.
 */

type Store = typeof import("@/lib/gig-chat-unread");

let fetchMock: ReturnType<typeof vi.fn>;
let unsubscribers: Array<() => void> = [];

async function freshStore(): Promise<Store> {
  vi.resetModules();
  return import("@/lib/gig-chat-unread");
}

/** Let the debounced refresh + the mocked fetch settle. */
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 15));
}

const token = vi.fn().mockResolvedValue("test-token");

beforeEach(() => {
  unsubscribers = [];
  token.mockClear();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("document", { visibilityState: "visible" });
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ counts: {} }),
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  for (const unsub of unsubscribers) unsub();
  unsubscribers = [];
  vi.unstubAllGlobals();
});

describe("gig chat unread store", () => {
  it("batches every subscribed gig into a single request", async () => {
    const store = await freshStore();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ counts: { "gig-a": 3, "gig-b": 0 } }),
    });

    const listenerA = vi.fn();
    const listenerB = vi.fn();
    unsubscribers.push(store.subscribeGigChatUnread("gig-a", token, listenerA));
    unsubscribers.push(store.subscribeGigChatUnread("gig-a", token, listenerA)); // duplicate id
    unsubscribers.push(store.subscribeGigChatUnread("gig-b", token, listenerB));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("gig-a");
    expect(url).toContain("gig-b");
    expect(url).toContain("ids=");
    expect(store.getGigChatUnread("gig-a")).toBe(3);
    expect(store.getGigChatUnread("gig-b")).toBe(0);
    expect(listenerA).toHaveBeenCalled();
    expect(listenerB).toHaveBeenCalled();
  });

  it("notifies only the cards whose count changed", async () => {
    const store = await freshStore();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ counts: { "gig-a": 1, "gig-b": 5 } }),
    });

    const listenerA = vi.fn();
    const listenerB = vi.fn();
    unsubscribers.push(store.subscribeGigChatUnread("gig-a", token, listenerA));
    unsubscribers.push(store.subscribeGigChatUnread("gig-b", token, listenerB));
    await flush();

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
    expect(store.getGigChatUnread("gig-b")).toBe(5);
  });

  it("setGigChatUnread updates the snapshot and notifies listeners", async () => {
    const store = await freshStore();
    const listener = vi.fn();
    unsubscribers.push(store.subscribeGigChatUnread("gig-a", token, listener));
    await flush();
    listener.mockClear();

    store.setGigChatUnread("gig-a", 7);
    expect(store.getGigChatUnread("gig-a")).toBe(7);
    expect(listener).toHaveBeenCalledTimes(1);

    // Same value → no redundant re-render.
    store.setGigChatUnread("gig-a", 7);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps the last count but stops notifying after unsubscribe", async () => {
    const store = await freshStore();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ counts: { "gig-a": 2 } }),
    });

    const listener = vi.fn();
    const unsub = store.subscribeGigChatUnread("gig-a", token, listener);
    await flush();
    expect(store.getGigChatUnread("gig-a")).toBe(2);

    listener.mockClear();
    unsub();
    // The count survives the unsubscribe so a remount does not flash empty.
    expect(store.getGigChatUnread("gig-a")).toBe(2);
    // With no subscribers left there is nobody to notify.
    store.setGigChatUnread("gig-a", 9);
    expect(listener).not.toHaveBeenCalled();
  });

  it("resolves 0 for gigs that were never fetched", async () => {
    const store = await freshStore();
    expect(store.getGigChatUnread("unknown")).toBe(0);
  });
});
