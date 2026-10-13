/**
 * Account-profile avatar resolution for the canonical band roster.
 *
 * `BandMember` has no Prisma relation to `User`, and the `User` table stores
 * no avatar column, so a database-side JOIN is impossible. The real profile
 * image of a linked account lives in Supabase auth `user_metadata.avatar_url`
 * (the same source the settings modal and navbar use). This module performs
 * that join in the application layer: one admin `listUsers` call, keyed by
 * normalised e-mail — the only reliable per-person key, because
 * `BandMember.userId` is shared with every virtual member of a band.
 *
 * The roster must never fail because of avatars: without a configured
 * service-role key (stub client) or when the admin API errors, this resolves
 * to an empty map and the UI falls back to initials badges.
 */

import { getSupabaseAdmin } from "./supabase-admin";

interface AdminAuthUser {
  id: string;
  email?: string | null;
  user_metadata?: {
    avatar_url?: string | null;
  };
}

/** Normalised lookup key for profile-avatar resolution (lower-cased, trimmed). */
export function profileEmailKey(email?: string | null): string {
  return (email || "").trim().toLowerCase();
}

const CACHE_TTL_MS = 60_000;
let cache: { value: Map<string, string>; expiresAt: number } | null = null;

/** Drop the cached avatar map (used by tests; the TTL covers hot reloads). */
export function clearProfileAvatarCache(): void {
  cache = null;
}

/**
 * Resolve `normalised e-mail -> profile avatar URL` for every Supabase account
 * that has a profile image. Never throws; on any failure it resolves to an
 * empty map so the roster still renders (initials badges instead of avatars).
 */
export async function fetchProfileAvatarsByEmail(): Promise<Map<string, string>> {
  if (cache && Date.now() < cache.expiresAt) return cache.value;

  const avatars = new Map<string, string>();

  try {
    const admin = getSupabaseAdmin();
    const hasAdminApi =
      Boolean(admin?.auth) &&
      Boolean((admin.auth as { admin?: unknown }).admin) &&
      typeof (admin.auth as { admin?: { listUsers?: unknown } }).admin?.listUsers === "function";

    if (!hasAdminApi) {
      // Stub client (missing SUPABASE_SERVICE_ROLE_KEY) or an older runtime:
      // degrade to "no profile avatars" instead of failing the roster.
      console.warn("[roster-avatars] Supabase admin listUsers unavailable; roster without profile avatars");
      return avatars;
    }

    const adminApi = (admin.auth as unknown as {
      admin: { listUsers: (params: { page: number; perPage: number }) => Promise<{ data: { users: AdminAuthUser[] } | null; error: { message: string } | null }> };
    }).admin;

    const { data, error } = await adminApi.listUsers({ page: 1, perPage: 1000 });
    if (error) {
      console.warn(`[roster-avatars] Supabase listUsers error: ${error.message}`);
      return avatars;
    }

    for (const user of data?.users ?? []) {
      const key = profileEmailKey(user.email);
      const avatar = user.user_metadata?.avatar_url;
      if (key && avatar) {
        avatars.set(key, avatar);
      }
    }
  } catch (error) {
    console.warn("[roster-avatars] failed to load profile avatars:", error);
    return avatars;
  }

  cache = { value: avatars, expiresAt: Date.now() + CACHE_TTL_MS };
  return avatars;
}
