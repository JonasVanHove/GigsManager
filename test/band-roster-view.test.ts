import { describe, expect, it } from "vitest";
import type { RosterMember } from "@/lib/band-roster";
import {
  applyProfileAvatars,
  buildCanonicalBandRoster,
  composeBandCardRoster,
  composeBandRoster,
  isRosterMemberCurrentUser,
  rosterEmailKey,
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

/**
 * Regression: a band card must render the canonical, band-scoped roster —
 * never the account-scoped member list (`/api/band-members`). That legacy list
 * only ever holds the viewer's own rows, so a joiner who receives it as their
 * "roster" sees just themselves instead of the band's full lineup. While a
 * band's roster is unloaded (or failed) the card must show a placeholder, not
 * a misleading account-scoped roster.
 */
describe("composeBandCardRoster", () => {
  const roster: RosterMember[] = [
    { id: "m-1", name: "Elias", email: "elias@band.be", isLeader: true, claimed: true },
    { id: "m-2", name: "Master", email: "master@band.be", isLeader: true },
    { id: "m-4", name: "Joiner", email: "joiner@band.be", isCurrentUser: true },
  ];
  const joiner = { id: "user-b", email: "joiner@band.be" };
  const owner = { id: "user-a", email: "elias@band.be" };

  it("gives a joiner the whole band roster, not only their own row", () => {
    const forJoiner = composeBandCardRoster({ "band-1": roster }, "band-1", joiner);
    expect(forJoiner.map((m) => m.id)).toEqual(["m-1", "m-2", "m-4"]);
    const current = forJoiner.filter((m) => m.isCurrentUser);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe("m-4");
  });

  it("renders the same full roster for owner and joiner alike", () => {
    const forOwner = composeBandCardRoster({ "band-1": roster }, "band-1", owner);
    const forJoiner = composeBandCardRoster({ "band-1": roster }, "band-1", joiner);
    expect(forOwner.map((m) => m.id)).toEqual(forJoiner.map((m) => m.id));
    expect(forOwner).toHaveLength(3);
    expect(forJoiner).toHaveLength(3);
  });

  it("never substitutes the account-scoped member list for a missing roster", () => {
    // Unloaded, failed and foreign bands all yield an empty list so the card
    // shows a loading/error placeholder instead of the viewer's own rows.
    expect(composeBandCardRoster({}, "band-1", joiner)).toEqual([]);
    expect(composeBandCardRoster({ "band-1": null }, "band-1", joiner)).toEqual([]);
    expect(composeBandCardRoster({ "band-2": roster }, "band-1", joiner)).toEqual([]);
  });
});

/**
 * Band-card rendering regression suite.
 *
 * A band card is the canonical, band-scoped roster composed through the card's
 * own "exclude me" rule. The band owner is a leader by definition, so the card
 * must NEVER hide them: doing so stripped the leader crown from the card and,
 * for a band whose owner is its only member, emptied the card entirely
 * ("no band members yet" on a band you lead). Only a plain member stops seeing
 * their own row.
 *
 * These scenarios mirror the real-world shapes that broke:
 *  - the demo band ("Demo Band Manager") where every virtual member shares the
 *    owner's userId,
 *  - a solo band whose roster holds only the owner's own row,
 *  - an owner + members band with one explicitly promoted leader,
 *  - an invite-joined member viewing someone else's band.
 */
describe("band card roster: excludeSelf must preserve the leader", () => {
  const owner = { id: "user-owner", email: "owner@band.be", name: "Demo Band Manager" };

  // Exactly what a band card renders: canonical roster -> card list.
  const cardFor = (
    members: RosterMember[],
    viewer: { id?: string; email?: string | null } | null,
    excludeSelf = true
  ) =>
    composeBandCardRoster(
      { "band-1": buildCanonicalBandRoster(members, { owner, viewer, bandName: "The Notes" }) },
      "band-1",
      viewer,
      { excludeSelf }
    );

  const demoMembers: RosterMember[] = [
    { id: "m-elias", name: "Elias", email: "elias@band.be" },
    { id: "m-maya", name: "Maya", email: "maya@band.be" },
    { id: "m-nora", name: "Nora", email: "nora@band.be" },
  ];

  it("shows the owner as the crowned leader on their own band card", () => {
    const viewer = { id: "user-owner", email: "owner@band.be" };
    const card = cardFor([...demoMembers], viewer);
    expect(card.map((m) => m.name)).toEqual(["Demo Band Manager", "Elias", "Maya", "Nora"]);
    const leaders = card.filter((m) => m.isLeader);
    expect(leaders).toHaveLength(1);
    expect(leaders[0].isOwner).toBe(true);
  });

  it("does not empty a solo band whose roster holds only the owner", () => {
    const viewer = { id: "user-owner", email: "owner@band.be" };
    const card = cardFor([], viewer);
    expect(card).toHaveLength(1);
    expect(card[0].isOwner).toBe(true);
    expect(card[0].isLeader).toBe(true);
  });

  it("keeps the owner visible even when every member shares the owner's userId", () => {
    // Demo shape: virtual members carry the owner's userId; the owner row is
    // identified by e-mail, so it must survive the excludeSelf filter.
    const shared = demoMembers.map((m) => ({ ...m, userId: "user-owner" }));
    const viewer = { id: "user-owner", email: "owner@band.be" };
    const card = cardFor(shared, viewer);
    expect(card).toHaveLength(4);
    expect(card.filter((m) => m.isOwner)).toHaveLength(1);
    expect(card[0].isLeader).toBe(true);
  });

  it("hides a plain joiner's own row while keeping both leaders", () => {
    const members: RosterMember[] = [
      { id: "m-bob", name: "Bob", email: "bob@band.be", isLeader: true },
      ...demoMembers,
      { id: "m-joiner", name: "Joiner", email: "joiner@band.be" },
    ];
    const viewer = { id: "user-joiner", email: "joiner@band.be" };
    const card = cardFor(members, viewer);
    expect(card.some((m) => m.id === "m-joiner")).toBe(false);
    const leaders = card.filter((m) => m.isLeader);
    expect(leaders).toHaveLength(2);
    expect(leaders.filter((m) => m.isOwner)).toHaveLength(1);
    expect(leaders.some((m) => m.id === "m-bob")).toBe(true);
  });

  it("keeps the joiner's own row when excludeSelf is off", () => {
    const members: RosterMember[] = [
      ...demoMembers,
      { id: "m-joiner", name: "Joiner", email: "joiner@band.be" },
    ];
    const viewer = { id: "user-joiner", email: "joiner@band.be" };
    const card = cardFor(members, viewer, false);
    expect(card.some((m) => m.id === "m-joiner")).toBe(true);
    expect(card).toHaveLength(5);
  });

  it("never drops a leader, even when the leader is the viewer (unit)", () => {
    const roster: RosterMember[] = [
      { id: "leader", name: "Leader", email: "leader@band.be", isLeader: true, isCurrentUser: true },
      { id: "plain", name: "Plain", email: "plain@band.be", isCurrentUser: true },
    ];
    const viewer = { id: "user-x", email: "leader@band.be" };
    expect(composeBandRoster(roster, viewer, { excludeSelf: true }).map((m) => m.id)).toEqual([
      "leader",
    ]);
  });

  it("lets the count preference include the viewer without touching the list", () => {
    const members: RosterMember[] = [
      ...demoMembers,
      { id: "m-joiner", name: "Joiner", email: "joiner@band.be" },
    ];
    const viewer = { id: "user-joiner", email: "joiner@band.be" };
    const cardList = cardFor(members, viewer, true);
    const countIncludingSelf = cardFor(members, viewer, false).length;
    expect(cardList.some((m) => m.id === "m-joiner")).toBe(false);
    expect(countIncludingSelf).toBe(cardList.length + 1);
  });
});

/**
 * Regression: a joining member whose account id is shared with other band rows
 * (the demo shape, where virtual members carry the owner's userId) must still
 * see every bandmate. Previously the API flagged EVERY row with a matching
 * userId as "me" and the card dropped them all, leaving the joiner with only
 * the leaders — the exact "joiner sees nobody but the leader" bug.
 */
describe("band card roster: a joiner sharing an account id still sees the band", () => {
  const owner = { id: "user-owner", email: "owner@band.be", name: "Owner One" };

  // The joiner's own row shares its userId with two virtual members, so a
  // userId-only match would flag all three and hide them all.
  const members: RosterMember[] = [
    { id: "m-owner", name: "Owner One", email: "owner@band.be", userId: "user-owner" },
    { id: "m-v1", name: "Virtual One", email: null, userId: "user-joiner" },
    { id: "m-v2", name: "Virtual Two", email: null, userId: "user-joiner" },
    { id: "m-joiner", name: "Joiner", email: "joiner@band.be", userId: "user-joiner" },
  ];
  const viewer = { id: "user-joiner", email: "joiner@band.be" };

  const canonical = buildCanonicalBandRoster(members, { owner, viewer, bandName: "The Notes" });

  it("flags exactly one row as the current user (matched by e-mail, not userId)", () => {
    const current = canonical.filter((m) => m.isCurrentUser);
    expect(current).toHaveLength(1);
    expect(current[0].id).toBe("m-joiner");
  });

  it("keeps every bandmate on the joiner's card", () => {
    const card = composeBandCardRoster({ "band-1": canonical }, "band-1", viewer, {
      excludeSelf: true,
    });
    expect(card.map((m) => m.id)).toEqual(["m-owner", "m-v1", "m-v2"]);
  });

  it("removes at most one row even when several rows look like the viewer", () => {
    const raw: RosterMember[] = [
      { id: "m-owner", name: "Owner", email: "owner@band.be", isLeader: true, userId: "user-joiner" },
      { id: "m-a", name: "A", email: null, userId: "user-joiner" },
      { id: "m-b", name: "B", email: null, userId: "user-joiner" },
    ];
    const stay = composeBandRoster(
      raw,
      { id: "user-joiner", email: "joiner@band.be" },
      { excludeSelf: true }
    );
    expect(stay.map((m) => m.id)).toEqual(["m-owner", "m-b"]);
  });
});

/**
 * The roster route resolves profile images through the application-layer
 * account join (Supabase auth keyed by e-mail). These helpers guarantee the
 * avatar precedence and e-mail normalisation that keep that join correct.
 */
describe("applyProfileAvatars", () => {
  const profileAvatars = new Map([
    ["elias@band.be", "https://cdn.example.com/elias-profile.png"],
    ["owner@band.be", "https://cdn.example.com/owner.png"],
  ]);

  it("fills a blank avatarUrl from the linked account's profile image", () => {
    const rows = applyProfileAvatars<RosterMember>(
      [{ id: "m-1", name: "Elias", email: "elias@band.be" }],
      profileAvatars
    );
    expect(rows[0].avatarUrl).toBe("https://cdn.example.com/elias-profile.png");
  });

  it("matches e-mail case-insensitively and ignores surrounding whitespace", () => {
    const rows = applyProfileAvatars<RosterMember>(
      [{ id: "m-1", name: "Elias", email: "  Elias@Band.be " }],
      profileAvatars
    );
    expect(rows[0].avatarUrl).toBe("https://cdn.example.com/elias-profile.png");
    expect(rosterEmailKey(" Elias@Band.be ")).toBe("elias@band.be");
  });

  it("keeps the member's own stored avatarUrl (stored avatar wins)", () => {
    const rows = applyProfileAvatars<RosterMember>(
      [{ id: "m-1", name: "Elias", email: "elias@band.be", avatarUrl: "https://cdn.example.com/custom.png" }],
      profileAvatars
    );
    expect(rows[0].avatarUrl).toBe("https://cdn.example.com/custom.png");
  });

  it("keeps null for rows without a stored avatar or linked profile (initials badge)", () => {
    const rows = applyProfileAvatars<RosterMember>(
      [{ id: "m-1", name: "Virtual", email: "virtual@band.be" }],
      profileAvatars
    );
    expect(rows[0].avatarUrl).toBeNull();
  });

  it("never matches on userId: virtual rows sharing the owner stay avatar-less", () => {
    const rows = applyProfileAvatars<RosterMember & { userId?: string | null }>(
      [{ id: "m-1", name: "Virtual", email: "virtual@band.be", userId: "user-owner" }],
      profileAvatars
    );
    // profileAvatars has no entry for virtual@band.be — even though the owner's
    // account (user-owner) does have an avatar.
    expect(rows[0].avatarUrl).toBeNull();
  });

  it("preserves the generic row shape (no lost fields)", () => {
    const rows = applyProfileAvatars<RosterMember>(
      [{ id: "m-1", name: "Elias", email: "elias@band.be", isLeader: true, bands: ["The Notes"] }],
      profileAvatars
    );
    expect(rows[0]).toMatchObject({
      id: "m-1",
      name: "Elias",
      isLeader: true,
      bands: ["The Notes"],
      avatarUrl: "https://cdn.example.com/elias-profile.png",
    });
  });
});
