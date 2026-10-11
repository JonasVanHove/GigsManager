import { describe, expect, it } from "vitest";
import type { RosterMember } from "@/lib/band-roster";
import {
  buildCanonicalBandRoster,
  composeBandRoster,
  isRosterMemberCurrentUser,
} from "@/lib/band-roster";

/**
 * The canonical roster must be identical and correct for the band owner and for
 * an invite-joiner, regardless of the messy real-world data where a band's
 * members all share the owner's userId. Owner is always leader+owner, joiners
 * are plain members, and the viewer sees themselves exactly once.
 */
describe("buildCanonicalBandRoster", () => {
  const owner = { id: "user-owner", email: "owner@band.be", name: "Owner One" };

  // Real-world shape: virtual members share the owner's userId; one was
  // explicitly promoted (isLeader: true).
  const members = [
    { id: "m-1", name: "Elias", email: "elias@band.be", isLeader: false, userId: "user-owner" },
    { id: "m-2", name: "Master", email: "master@band.be", isLeader: true, userId: "user-owner" },
    { id: "m-3", name: "Zinnia", email: "zinnia@band.be", isLeader: false, userId: "user-owner" },
  ];

  describe("as seen by the band owner (creator)", () => {
    const viewer = { id: "user-owner", email: "owner@band.be" };
    const roster = buildCanonicalBandRoster(members, { owner, viewer, bandName: "The Notes" });

    it("projects the owner exactly once as owner + leader", () => {
      const owners = roster.filter((m) => m.isOwner);
      expect(owners).toHaveLength(1);
      expect(owners[0].isLeader).toBe(true);
      expect(owners[0].isCurrentUser).toBe(true);
      expect(owners[0].email).toBe("owner@band.be");
    });

    it("marks the owner as the current user on exactly one row", () => {
      const current = roster.filter((m) => m.isCurrentUser);
      expect(current).toHaveLength(1);
      expect(current[0].isOwner).toBe(true);
    });

    it("leaves virtual members as non-owners", () => {
      expect(roster.filter((m) => !m.isOwner).every((m) => m.isOwner === false)).toBe(true);
    });

    it("keeps only the explicitly promoted member as a (non-owner) leader", () => {
      const leaders = roster.filter((m) => m.isLeader);
      expect(leaders).toHaveLength(2); // owner + promoted Master
      const promoted = leaders.find((m) => m.id === "m-2");
      expect(promoted?.isOwner).toBe(false);
      expect(promoted?.isLeader).toBe(true);
    });

    it("does not crown members that only share the owner's userId", () => {
      expect(roster.find((m) => m.id === "m-1")?.isLeader).toBe(false);
      expect(roster.find((m) => m.id === "m-3")?.isLeader).toBe(false);
    });
  });

/**
 * Regression coverage for the "joining member sees themselves twice and the
 * leader's crown is hidden" bug. The canonical band roster already contains the
 * viewer as a real row, so the view must never inject a synthetic current-user
 * and must render the roster identically for owner and joiner.
 */
  describe("as seen by an invite-joined member", () => {
    const joiner = { id: "user-joiner", email: "joiner@band.be" };
    const withJoiner = [
      ...members,
      { id: "m-4", name: "Joiner", email: "joiner@band.be", isLeader: false, userId: "user-joiner" },
    ];
    const roster = buildCanonicalBandRoster(withJoiner, { owner, viewer: joiner, bandName: "The Notes" });

    it("shows the owner as leader + owner to the joiner too", () => {
      const owners = roster.filter((m) => m.isOwner);
      expect(owners).toHaveLength(1);
      expect(owners[0].isLeader).toBe(true);
      expect(owners[0].email).toBe("owner@band.be");
    });

    it("marks the joiner's own row as the current user, not the owner", () => {
      const current = roster.filter((m) => m.isCurrentUser);
      expect(current).toHaveLength(1);
      expect(current[0].id).toBe("m-4");
      expect(current[0].isOwner).toBe(false);
      expect(current[0].isLeader).toBe(false);
    });

    it("does not flag the joiner as owner or leader", () => {
      const joinerRow = roster.find((m) => m.id === "m-4");
      expect(joinerRow?.isOwner).toBe(false);
      expect(joinerRow?.isLeader).toBe(false);
    });

    it("produces the same membership ids as the owner's view", () => {
      const ownerView = buildCanonicalBandRoster(withJoiner, {
        owner,
        viewer: { id: "user-owner", email: "owner@band.be" },
        bandName: "The Notes",
      });
      expect(roster.map((m) => m.id).sort()).toEqual(ownerView.map((m) => m.id).sort());
    });
  });

  describe("owner identified by their real member row (e-mail match)", () => {
    const membersWithOwnerRow = [
      { id: "m-owner", name: "Owner One", email: "owner@band.be", isLeader: false, userId: "user-owner" },
      { id: "m-1", name: "Elias", email: "elias@band.be", isLeader: false, userId: "user-owner" },
    ];
    const roster = buildCanonicalBandRoster(membersWithOwnerRow, {
      owner,
      viewer: { id: "user-owner", email: "owner@band.be" },
      bandName: "The Notes",
    });

    it("reuses the owner's real row instead of projecting a duplicate", () => {
      const owners = roster.filter((m) => m.isOwner);
      expect(owners).toHaveLength(1);
      expect(owners[0].id).toBe("m-owner");
    });

    it("promotes the owner's real row to leader even if its flag was false", () => {
      expect(roster.find((m) => m.id === "m-owner")?.isLeader).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("tolerates an empty roster and still shows the owner", () => {
      const roster = buildCanonicalBandRoster<RosterMember>([], {
        owner,
        viewer: { id: "user-owner", email: "owner@band.be" },
        bandName: "The Notes",
      });
      expect(roster).toHaveLength(1);
      expect(roster[0].isOwner).toBe(true);
      expect(roster[0].isLeader).toBe(true);
    });

    it("tolerates a null roster payload", () => {
      const roster = buildCanonicalBandRoster(null, { owner, bandName: "The Notes" });
      expect(roster).toHaveLength(1);
      expect(roster[0].isOwner).toBe(true);
    });

    it("sorts the leader to the front", () => {
      const roster = buildCanonicalBandRoster(members, { owner, viewer: { id: "x" }, bandName: "The Notes" });
      expect(roster[0].isLeader).toBe(true);
    });
  });
});


describe("band roster view", () => {
  const leader = {
    id: "member-a",
    name: "Alice",
    email: "alice@example.com",
    isLeader: true,
    userId: "user-a",
  };
  const joiner = {
    id: "member-b",
    name: "Bob",
    email: "bob@example.com",
    isLeader: false,
    userId: "user-b",
  };
  const roster = [leader, joiner];

  it("renders the canonical roster verbatim so every account agrees", () => {
    expect(composeBandRoster(roster, { id: "user-a" }).map((m) => m.id)).toEqual([
      "member-a",
      "member-b",
    ]);
    expect(composeBandRoster(roster, { id: "user-b" }).map((m) => m.id)).toEqual([
      "member-a",
      "member-b",
    ]);
  });

  it("never duplicates the viewer, even though they are a real roster row", () => {
    const forJoiner = composeBandRoster(roster, { id: "user-b", email: "bob@example.com" });
    expect(forJoiner.filter((m) => m.id === "member-b")).toHaveLength(1);
    expect(forJoiner).toHaveLength(2);
  });

  it("identifies the viewer by id and by e-mail", () => {
    expect(isRosterMemberCurrentUser(joiner, { id: "user-b" })).toBe(true);
    expect(isRosterMemberCurrentUser(joiner, { email: "BOB@example.com" })).toBe(true);
    expect(isRosterMemberCurrentUser(leader, { id: "user-b" })).toBe(false);
  });

  it("honours an explicit isCurrentUser flag from the API", () => {
    const flagged = [{ ...joiner, isCurrentUser: true, userId: undefined }];
    expect(isRosterMemberCurrentUser(flagged[0], { id: "someone-else" })).toBe(true);
  });

  it("drops only the viewer when excludeSelf is set, keeping the leader", () => {
    const forJoiner = composeBandRoster(roster, { id: "user-b" }, { excludeSelf: true });
    expect(forJoiner.map((m) => m.id)).toEqual(["member-a"]);
  });

  it("tolerates a missing roster payload", () => {
    expect(composeBandRoster(undefined)).toEqual([]);
    expect(composeBandRoster(null, { id: "user-a" }, { excludeSelf: true })).toEqual([]);
  });
});
