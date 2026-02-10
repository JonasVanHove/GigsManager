/**
 * Extract user ID from Supabase JWT in request headers.
 */

import type { NextRequest } from "next/server";

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

/**
 * Get or create a User in our database from Supabase auth.
 */
export async function getOrCreateUser(
  supabaseId: string,
  email: string,
  name?: string | null
) {
  const { prisma } = await import("@/lib/prisma");

  let user = await prisma.user.findUnique({
    where: { supabaseId },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        supabaseId,
        email,
        name: name || email.split("@")[0],
      },
    });
  }

  return user;
}
