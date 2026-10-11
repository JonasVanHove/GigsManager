import { describe, expect, it } from "vitest";
import { composeBandRoster, isRosterMemberCurrentUser } from "@/lib/band-roster";

/**
 * Regression coverage for the "joining member sees themselves twice and the
 * leader's crown is hidden" bug. The canonical band roster already contains the
 * viewer as a real row, so the view must never inject a synthetic current-user
 * and must render the roster identically for owner and joiner.
 */
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
