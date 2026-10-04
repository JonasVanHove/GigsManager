import { afterEach, describe, expect, it, vi } from "vitest";
import { isOffline, isServiceWorkerReady, pinStageKit } from "@/lib/pwa";

/**
 * Stage Mode offline kit (v1.42.0).
 *
 * The vitest environment is `node`, so `navigator`/`window` are stubbed here.
 * That is also the point of these tests: the module must behave correctly when
 * the service worker is absent, has not taken control, or never answers — none
 * of which may break the one screen that has to work mid-gig.
 */

function stubEnv(options: {
  controller?: unknown;
  onLine?: boolean;
  hasServiceWorker?: boolean;
  postMessage?: (msg: unknown) => void;
}) {
  const listeners: Array<(e: { data?: unknown }) => void> = [];
  // A controller exists only when one was explicitly supplied and is truthy;
  // `controller: null` and omitting it both mean "not controlling yet".
  const controller = options.controller
    ? { postMessage: options.postMessage ?? vi.fn() }
    : null;

  const serviceWorker = {
    controller,
    addEventListener: (_type: string, fn: (e: { data?: unknown }) => void) => {
      listeners.push(fn);
    },
    removeEventListener: (_type: string, fn: (e: { data?: unknown }) => void) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };

  if (options.hasServiceWorker === false) {
    vi.stubGlobal("navigator", { onLine: options.onLine ?? true });
  } else {
    vi.stubGlobal("navigator", {
      onLine: options.onLine ?? true,
      serviceWorker,
    });
  }
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>),
  });

  return {
    serviceWorker,
    /** Simulates the worker replying. */
    reply(data: unknown) {
      listeners.slice().forEach((fn) => fn({ data }));
    },
    get listenerCount() {
      return listeners.length;
    },
  };
}

describe("isServiceWorkerReady / isOffline", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is not ready when the browser has no service worker support", () => {
    stubEnv({ hasServiceWorker: false });
    expect(isServiceWorkerReady()).toBe(false);
  });

  it("is not ready until a worker is controlling the page", () => {
    stubEnv({ controller: null });
    expect(isServiceWorkerReady()).toBe(false);
  });

  it("is ready once a worker controls the page", () => {
    stubEnv({ controller: {} });
    expect(isServiceWorkerReady()).toBe(true);
  });

  it("reports offline only when the browser says so", () => {
    stubEnv({ controller: {}, onLine: false });
    expect(isOffline()).toBe(true);
    stubEnv({ controller: {}, onLine: true });
    expect(isOffline()).toBe(false);
  });
});

describe("pinStageKit", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does nothing when no worker is in control", async () => {
    stubEnv({ controller: null });
    await expect(
      pinStageKit({ gigId: "g1", setlistId: "s1", token: "t" })
    ).resolves.toBe(0);
  });

  it("does nothing without a token", async () => {
    const env = stubEnv({ controller: {} });
    await expect(pinStageKit({ gigId: "g1", setlistId: "s1", token: "" })).resolves.toBe(0);
    expect(env.listenerCount).toBe(0);
  });

  it("asks the worker to pin both the gig and its setlist", async () => {
    const postMessage = vi.fn();
    const env = stubEnv({ controller: {}, postMessage });
    const pending = pinStageKit({ gigId: "g1", setlistId: "s9", token: "tok" });

    expect(postMessage).toHaveBeenCalledTimes(1);
    const message = postMessage.mock.calls[0][0] as {
      type: string;
      entries: Array<{ url: string; token: string }>;
    };
    expect(message.type).toBe("PIN_STAGE_KIT");
    expect(message.entries.map((e) => e.url)).toEqual([
      "/api/gigs/g1",
      "/api/setlists/s9",
    ]);
    expect(message.entries.every((e) => e.token === "tok")).toBe(true);

    env.reply({ type: "STAGE_KIT_PINNED", pinned: 2 });
    await expect(pending).resolves.toBe(2);
  });

  it("pins only the gig when the gig has no setlist", async () => {
    const postMessage = vi.fn();
    const env = stubEnv({ controller: {}, postMessage });
    const pending = pinStageKit({ gigId: "g1", setlistId: null, token: "tok" });

    const message = postMessage.mock.calls[0][0] as { entries: Array<{ url: string }> };
    expect(message.entries).toHaveLength(1);
    expect(message.entries[0].url).toBe("/api/gigs/g1");

    env.reply({ type: "STAGE_KIT_PINNED", pinned: 1 });
    await expect(pending).resolves.toBe(1);
  });

  it("escapes ids so a crafted value cannot escape the path", async () => {
    const postMessage = vi.fn();
    const env = stubEnv({ controller: {}, postMessage });
    const pending = pinStageKit({ gigId: "a/../b", setlistId: "c?d", token: "tok" });

    const message = postMessage.mock.calls[0][0] as { entries: Array<{ url: string }> };
    expect(message.entries[0].url).toBe("/api/gigs/a%2F..%2Fb");
    expect(message.entries[1].url).toBe("/api/setlists/c%3Fd");

    env.reply({ type: "STAGE_KIT_PINNED", pinned: 2 });
    await pending;
  });

  it("ignores messages that are not its own reply", async () => {
    const env = stubEnv({ controller: {} });
    const pending = pinStageKit({ gigId: "g1", token: "tok" });

    env.reply({ type: "SOMETHING_ELSE", pinned: 99 });
    env.reply({ type: "STAGE_KIT_PINNED", pinned: 1 });

    await expect(pending).resolves.toBe(1);
  });

  it("removes its listener once the worker replies", async () => {
    const env = stubEnv({ controller: {} });
    const pending = pinStageKit({ gigId: "g1", token: "tok" });
    expect(env.listenerCount).toBe(1);
    env.reply({ type: "STAGE_KIT_PINNED", pinned: 1 });
    await pending;
    // A leaked listener would accumulate one per gig opened.
    expect(env.listenerCount).toBe(0);
  });

  it("resolves to 0 when postMessage throws", async () => {
    stubEnv({
      controller: {},
      postMessage: () => {
        throw new Error("worker gone");
      },
    });
    await expect(pinStageKit({ gigId: "g1", token: "tok" })).resolves.toBe(0);
  });

  it("gives up rather than hanging when the worker never answers", async () => {
    vi.useFakeTimers();
    try {
      stubEnv({ controller: {} });
      const pending = pinStageKit({ gigId: "g1", token: "tok" });
      await vi.advanceTimersByTimeAsync(11_000);
      await expect(pending).resolves.toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

