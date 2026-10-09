/**
 * Extract user ID from Supabase JWT in request headers.
 */

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { claimUnclaimedMembersForUser } from "@/lib/band-invites";
import { prisma } from "@/lib/prisma";

export function getUserIdFromHeader(
  request: NextRequest
): string | null {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return null;

    const token = authHeader.slice(7);

    // JWT format: header.payload.signature
    const payload = token.split(".")[1];
    if (!payload) return null;

    // Decode base64url
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString()
    );

    return decoded.sub || null; // 'sub' is the user ID in Supabase JWTs
  } catch {
    return null;
  }
}

/** Verify the bearer token with Supabase before using its subject for writes. */
export async function getVerifiedUserIdFromHeader(
  request: NextRequest
): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

/**
 * Get or create a User in our database from Supabase auth.
 */
export async function getOrCreateUser(
  supabaseId: string,
  email: string,
  name?: string | null
) {
  const user = await prisma.user.upsert({
    where: { supabaseId },
    update: {
      email,
      ...(name ? { name } : {}),
    },
    create: {
      supabaseId,
      email,
      name: name || email.split("@")[0],
    },
  });

  // A bandmate is usually invited by e-mail long before they have an account,
  // so their member row sits unclaimed. Claim it here — this runs on the first
  // authenticated request after sign-up, and is a no-op for everyone else.
  await claimUnclaimedMembersForUser(user.id, user.email);

  return user;
}

/**
 * Shared guard for gig-scoped routes.
 *
 * Returns either a 401 NextResponse (no/invalid auth) or a ready-to-use user.
 * Callers must check `instanceof NextResponse` before continuing.
 */
export async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getOrCreateUser(
    data.user.id,
    data.user.email || "",
    data.user.user_metadata?.name
  );

  return { user };
}

/** Makes sure the gig exists AND belongs to the caller (prevents IDOR). */
export async function requireOwnedGigOr404(gigId: string, userId: string) {
  const { prisma } = await import("@/lib/prisma");
  const gig = await prisma.gig.findFirst({ where: { id: gigId, userId } });
  if (!gig) {
    return {
      error: NextResponse.json({ error: "Gig not found" }, { status: 404 }),
    };
  }
  return { gig };
}
