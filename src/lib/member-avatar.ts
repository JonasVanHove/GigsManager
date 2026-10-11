export function getBandMemberInitial(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) {
    return "?";
  }

  return trimmed.charAt(0).toUpperCase();
}

/**
 * Resolve the avatar URL for a band-member chip.
 *
 * Precedence:
 *   1. the member's own stored `avatarUrl`, if present;
 *   2. the `fallbackAvatarUrl` when the caller supplies one — the caller passes
 *      this only for the signed-in viewer, so their Supabase profile image shows
 *      even when no BandMember row stores an avatar (e.g. the owner projection);
 *   3. otherwise null, which renders the initials badge.
 *
 * The historical "jonas" special-case is preserved so a member literally named
 * Jonas still shows the authenticated profile image even if a stale custom
 * avatar is stored on their row.
 */
export function getBandMemberAvatarUrl(
  name?: string | null,
  avatarUrl?: string | null,
  fallbackAvatarUrl?: string | null
): string | null {
  const normalizedName = name?.trim().toLowerCase();

  if (normalizedName === "jonas") {
    return fallbackAvatarUrl || avatarUrl || null;
  }

  return avatarUrl || fallbackAvatarUrl || null;
}