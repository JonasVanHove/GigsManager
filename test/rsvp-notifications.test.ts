import { describe, expect, it } from "vitest";
import {
  excludeActor,
  gigDeepLink,
  resolveRecipients,
  RSVP_STATUS_ICONS,
  RSVP_STATUS_LABELS,
  type RsvpRecipient,
  type RsvpStatus,
} from "@/lib/rsvp-notifications";

/**
 * Who hears about an RSVP change is a permission decision, so it is pinned
 * down here: a bandmate must never be told about their own tap, a leader who
 * is also the owner must not get two alerts, and a leader without a claimable
 * account has nowhere to send anything.
 */

const ALL_STATUSES: RsvpStatus[] = ["ATTENDING", "DECLINED", "MAYBE", "PENDING"];

describe("resolveRecipients", () => {
  it("returns the owner and every leader", () => {
    const result = resolveRecipients(
      { userId: "owner", email: "owner@example.com", name: "Owner" },
      [
        { userId: "leader-1", email: "l1@example.com", name: "L1" },
        { userId: "leader-2", email: "l2@example.com", name: "L2" },
      ]
    );

    expect(result.map((r) => r.userId)).toEqual(["owner", "leader-1", "leader-2"]);
  });

  it("puts the owner first", () => {
    const result = resolveRecipients(
      { userId: "owner" },
      [{ userId: "leader-1" }]
    );
    expect(result[0].userId).toBe("owner");
  });

  it("de-duplicates a leader who is also the owner", () => {
    // Very common: the person who created the band is also its leader.
    const result = resolveRecipients(
      { userId: "owner", email: "owner@example.com" },
      [
        { userId: "owner", email: "stale@example.com" },
        { userId: "leader-1", email: "l1@example.com" },
      ]
    );

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.userId)).toEqual(["owner", "leader-1"]);
    // The owner's own record wins, not the leader row's copy.
    expect(result[0].email).toBe("owner@example.com");
  });

  it("de-duplicates repeated leaders", () => {
    const result = resolveRecipients(null, [
      { userId: "leader-1" },
      { userId: "leader-1" },
      { userId: "leader-1" },
    ]);
    expect(result).toHaveLength(1);
  });

  it("drops leaders who never claimed an account", () => {
    // An unclaimed BandMember row has no userId and cannot be notified.
    const result = resolveRecipients(
      { userId: "owner" },
      [{ userId: null, email: "ghost@example.com" }, { userId: "leader-1" }]
    );
    expect(result.map((r) => r.userId)).toEqual(["owner", "leader-1"]);
  });

  it("returns an empty list when the band has no known owner", () => {
    expect(resolveRecipients(null, [])).toEqual([]);
  });

  it("normalises missing email and name to null", () => {
    const result = resolveRecipients(null, [{ userId: "leader-1" }]);
    expect(result[0]).toEqual({
      userId: "leader-1",
      email: null,
      name: null,
    });
  });
});

describe("excludeActor", () => {
  const recipients: RsvpRecipient[] = [
    { userId: "owner", email: null, name: null },
    { userId: "actor", email: null, name: null },
    { userId: "leader-1", email: null, name: null },
  ];

  it("removes the person who changed the status", () => {
    expect(excludeActor(recipients, "actor").map((r) => r.userId)).toEqual([
      "owner",
      "leader-1",
    ]);
  });

  it("leaves everyone when the actor is not a recipient", () => {
    expect(excludeActor(recipients, "someone-else")).toHaveLength(3);
  });

  it("handles an empty recipient list", () => {
    expect(excludeActor([], "actor")).toEqual([]);
  });
});

describe("gigDeepLink", () => {
  it("targets the overview tab and names the gig", () => {
    expect(gigDeepLink("gig_123")).toBe("/app?tab=gigs&gig=gig_123");
  });

  it("escapes ids that would otherwise break the query string", () => {
    // cuid ids are safe, but a crafted id must not inject another param.
    expect(gigDeepLink("a&tab=bands")).toBe(
      "/app?tab=gigs&gig=a%26tab%3Dbands"
    );
  });
});

describe("RSVP presentation", () => {
  it("has a label and an icon for every status", () => {
    for (const status of ALL_STATUSES) {
      expect(RSVP_STATUS_LABELS[status]).toBeTruthy();
      expect(RSVP_STATUS_ICONS[status]).toBeTruthy();
    }
  });

  it("uses distinct icons per status", () => {
    const icons = ALL_STATUSES.map((s) => RSVP_STATUS_ICONS[s]);
    expect(new Set(icons).size).toBe(ALL_STATUSES.length);
  });

  it("does not mention a status as unknown", () => {
    expect(Object.values(RSVP_STATUS_LABELS)).not.toContain("undefined");
  });
});
