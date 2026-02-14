import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateUser } from "@/lib/auth-helpers";

async function requireAuth(request: NextRequest) {
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

export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const body = await request.json();
    const updates = body.updates as Array<{ id: string; updates: Record<string, any> }>;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: "No updates provided" },
        { status: 400 }
      );
    }

    // Verify all gigs belong to user
    const gigIds = updates.map((u) => u.id);
    const gigs = await prisma.gig.findMany({
      where: {
        id: { in: gigIds },
        userId: user.id,
      },
    });

    if (gigs.length !== updates.length) {
      return NextResponse.json(
        { error: "Some gigs not found or unauthorized" },
        { status: 403 }
      );
    }

    // Apply all updates in parallel
    const results = await Promise.all(
      updates.map((update) =>
        prisma.gig.update({
          where: { id: update.id },
          data: update.updates,
        })
      )
    );

    return NextResponse.json({
      success: true,
      updated: results.length,
      gigs: results,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PATCH /api/gigs/bulk-update] Error:", msg);
    return NextResponse.json(
      { error: "Failed to update gigs", details: msg },
      { status: 500 }
    );
  }
}
