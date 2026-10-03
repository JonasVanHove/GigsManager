import { describe, expect, it } from "vitest";
import {
  computeStageTiming,
  estimateTotalMinutes,
  findTuningAlerts,
  formatDuration,
  isOverrun,
  nextIndex,
  nextSongIndex,
  normaliseStageItems,
  positionLabel,
  previousIndex,
  previousSongIndex,
  resolveActiveIndex,
  type StageItem,
} from "@/lib/stage-mode";

/**
 * Stage Mode is read at arm's length in the dark during a live set, so these
 * tests pin the decisions a musician actually depends on: which row is live,
 * what comes next, whether the guitar needs retuning, and what the clock says.
 */

function song(overrides: Partial<StageItem> = {}): StageItem {
  return {
    id: "s1",
    type: "song",
    title: "So What",
    key: "Am",
    bpm: 120,
    notes: "",
    tuning: "",
    chords: "",
    ...overrides,
  };
}

const set: StageItem[] = [
  song({ id: "a", title: "So What" }),
  song({ id: "b", title: "Blue in Green" }),
  song({ id: "c", title: "All Blues" }),
];

describe("normaliseStageItems", () => {
  it("maps the API shape onto display rows", () => {
    const [item] = normaliseStageItems([
      {
        id: "x",
        type: "song",
        title: "  So What  ",
        keySignature: " Am ",
        bpm: 120,
        notes: " count in ",
      },
    ]);

    expect(item).toMatchObject({
      id: "x",
      title: "So What",
      key: "Am",
      bpm: 120,
      notes: "count in",
    });
  });

  it("treats anything other than 'note' as a song", () => {
    const items = normaliseStageItems([
      { title: "A" },
      { title: "B", type: "note" },
      { title: "C", type: "something-else" },
    ]);
    expect(items.map((i) => i.type)).toEqual(["song", "note", "song"]);
  });

  it("rejects nonsense BPM the same way the API does", () => {
    const items = normaliseStageItems([
      { title: "ok", bpm: 90 },
      { title: "zero", bpm: 0 },
      { title: "text", bpm: Number.NaN },
      { title: "too fast", bpm: 4000 },
    ]);
    expect(items.map((i) => i.bpm)).toEqual([90, null, null, null]);
  });

  it("drops rows with nothing to show", () => {
    const items = normaliseStageItems([{ title: "Real song" }, { title: "   " }, {}]);
    expect(items).toHaveLength(1);
  });

  it("handles a missing or malformed list", () => {
    expect(normaliseStageItems(null)).toEqual([]);
    expect(normaliseStageItems(undefined)).toEqual([]);
    expect(normaliseStageItems([])).toEqual([]);
  });

  it("falls back to a synthetic id so rows never collide", () => {
    const items = normaliseStageItems([{ title: "A" }, { title: "B" }]);
    expect(items[0].id).not.toBe(items[1].id);
  });
});

describe("navigation", () => {
  it("starts on the first row", () => {
    expect(resolveActiveIndex(set, 0)).toBe(0);
  });

  it("clamps an out-of-range index instead of breaking", () => {
    expect(resolveActiveIndex(set, 99)).toBe(2);
    expect(resolveActiveIndex(set, -5)).toBe(0);
    expect(resolveActiveIndex(set, Number.NaN)).toBe(0);
  });

  it("has no active row for an empty set", () => {
    expect(resolveActiveIndex([], 0)).toBe(-1);
    expect(nextIndex([], 0)).toBeNull();
    expect(previousIndex([], 0)).toBeNull();
  });

  it("stops at the ends instead of wrapping", () => {
    expect(previousIndex(set, 0)).toBeNull();
    expect(nextIndex(set, 2)).toBeNull();
  });

  it("steps between adjacent rows", () => {
    expect(nextIndex(set, 0)).toBe(1);
    expect(previousIndex(set, 1)).toBe(0);
  });

  it("skips trailing notes when jumping between songs", () => {
    const withBreak: StageItem[] = [
      song({ id: "a" }),
      song({ id: "b" }),
      { ...song({ id: "break" }), type: "note", title: "Talk" },
    ];
    // From the last song, the next *song* does not exist.
    expect(nextSongIndex(withBreak, 1)).toBeNull();
    expect(previousSongIndex(withBreak, 2)).toBe(1);
  });

  it("labels the position one-based", () => {
    expect(positionLabel(set, 0)).toBe("1 / 3");
    expect(positionLabel(set, 2)).toBe("3 / 3");
    expect(positionLabel([], 0)).toBe("");
  });
});

describe("computeStageTiming", () => {
  const items = [song(), song()]; // 2 songs x 4 min = 8 min

  it("measures elapsed from the start of the set", () => {
    const timing = computeStageTiming({
      startedAtMs: 1_000_000,
      nowMs: 1_060_000,
      items,
    });
    expect(timing.elapsedMs).toBe(60_000);
  });

  it("never renders a negative clock for a future start", () => {
    const timing = computeStageTiming({
      startedAtMs: 2_000_000,
      nowMs: 1_000_000,
      items,
    });
    expect(timing.elapsedMs).toBe(0);
    expect(timing.remainingMs).toBe(timing.totalMs);
  });

  it("clamps remaining at zero once the set overruns", () => {
    const timing = computeStageTiming({ startedAtMs: 0, nowMs: 3_600_000, items });
    expect(timing.remainingMs).toBe(0);
    expect(timing.progressPct).toBe(100);
    expect(isOverrun(timing)).toBe(true);
  });

  it("reports progress as a percentage of the estimate", () => {
    const timing = computeStageTiming({ startedAtMs: 0, nowMs: 240_000, items });
    expect(timing.progressPct).toBe(50);
    expect(isOverrun(timing)).toBe(false);
  });

  it("never divides by zero for an empty set", () => {
    const timing = computeStageTiming({ startedAtMs: 0, nowMs: 1000, items: [] });
    expect(timing.totalMs).toBe(0);
    expect(timing.progressPct).toBe(0);
    expect(isOverrun(timing)).toBe(false);
  });

  it("counts notes as shorter breaks than songs", () => {
    expect(estimateTotalMinutes([song(), { ...song(), type: "note" }])).toBe(5);
    expect(estimateTotalMinutes([])).toBe(0);
  });
});

describe("formatDuration", () => {
  it("renders MM:SS below an hour", () => {
    expect(formatDuration(65_000).text).toBe("01:05");
  });

  it("renders H:MM:SS past an hour", () => {
    expect(formatDuration(3_725_000).text).toBe("1:02:05");
  });

  it("pads seconds", () => {
    expect(formatDuration(9_000).text).toBe("00:09");
  });

  it("floors partial seconds rather than rounding up", () => {
    expect(formatDuration(1_999).text).toBe("00:01");
  });

  it("clamps a negative duration to zero", () => {
    expect(formatDuration(-5_000).text).toBe("00:00");
  });

  it("exposes the parts for the header labels", () => {
    expect(formatDuration(3_725_000)).toMatchObject({ hours: 1, minutes: 2, seconds: 5 });
  });
});
describe("findTuningAlerts", () => {
  it("flags a song that changes tuning from the previous one", () => {
    const alerts = findTuningAlerts([
      song({ id: "a", tuning: "Standard" }),
      song({ id: "b", tuning: "Drop D" }),
    ]);
    expect(alerts.has(1)).toBe(true);
    expect(alerts.has(0)).toBe(false);
  });

  it("does not flag an unchanged tuning", () => {
    const alerts = findTuningAlerts([
      song({ id: "a", tuning: "Drop D" }),
      song({ id: "b", tuning: "Drop D" }),
    ]);
    expect(alerts.size).toBe(0);
  });

  it("ignores case and surrounding space", () => {
    const alerts = findTuningAlerts([
      song({ id: "a", tuning: "Drop D" }),
      song({ id: "b", tuning: "  drop d  " }),
    ]);
    expect(alerts.size).toBe(0);
  });

  it("does not treat missing tuning as a retune", () => {
    // Unknown data is not a change; flagging it would cry wolf all night.
    const alerts = findTuningAlerts([
      song({ id: "a", tuning: "" }),
      song({ id: "b", tuning: "Drop D" }),
      song({ id: "c", tuning: "" }),
    ]);
    expect(alerts.size).toBe(0);
  });
});