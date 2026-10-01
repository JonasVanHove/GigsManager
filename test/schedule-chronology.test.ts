import { describe, it, expect } from "vitest";
import { isChronologicallyValid, timeToMinutes } from "@/lib/gig-ai";

// The schedule generator rejects a Groq answer when the steps it produced are
// not chronological (a departure after arrival, or dinner after stage prep).
describe("AI schedule chronology guard", () => {
  it("accepts a well-ordered day", () => {
    expect(
      isChronologicallyValid(["14:00", "15:30", "16:00", "17:00", "19:30"])
    ).toBe(true);
  });

  it("accepts steps that share the same clock time", () => {
    expect(isChronologicallyValid(["16:00", "16:00", "17:00"])).toBe(true);
  });

  it("rejects a schedule that runs backwards", () => {
    expect(isChronologicallyValid(["18:00", "14:00"])).toBe(false);
  });

  it("rejects malformed or out-of-range times", () => {
    expect(isChronologicallyValid(["9:00", "10:00"])).toBe(false); // needs 2 digits
    expect(isChronologicallyValid(["25:00", "10:00"])).toBe(false);
    expect(isChronologicallyValid(["10:75", "11:00"])).toBe(false);
    expect(isChronologicallyValid(["noon", "11:00"])).toBe(false);
  });

  it("accepts midnight and the last minute of the day", () => {
    expect(isChronologicallyValid(["00:00", "23:59"])).toBe(true);
  });

  it("parses times to minutes since midnight", () => {
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("16:00")).toBe(960);
    expect(timeToMinutes("23:59")).toBe(1439);
    expect(Number.isNaN(timeToMinutes("24:00"))).toBe(true);
  });
});
