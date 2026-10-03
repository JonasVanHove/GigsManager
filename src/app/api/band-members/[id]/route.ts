import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { invalidateCache } from "@/lib/cache";
import { resolveMemberUserId } from "@/lib/band-invites";
import { isBandLeaderOrOwner } from "@/lib/band-sharing";

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

// GET /api/band-members/[id] - Get single band member
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult as { user: { id: string } };

    const bandMember = await prisma.bandMember.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
      include: {
        gigs: {
          include: {
            gig: true,
          },
          orderBy: {
            gig: {
              date: "desc",
            },
          },
        },
      },
    });

    if (!bandMember) {
      return NextResponse.json(
        { error: "Band member not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(bandMember);
  } catch (error) {
    console.error("GET /api/band-members/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch band member" },
      { status: 500 }
    );
  }
}

// PATCH /api/band-members/[id] - Update band member
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult as { user: { id: string } };

    const body = await req.json();
    const { name, email, phone, notes, avatarUrl } = body;
    const bands = Array.isArray(body.bands)
      ? body.bands
          .filter((band: unknown) => typeof band === "string")
          .map((band: string) => band.trim())
          .filter((band: string) => band.length > 0)
      : undefined;

    // Ownership or Leader check: the owner of the member record, or a
    // leader/owner of one of the member's bands.
    //
    // This lookup is deliberately by id alone. It used to filter on `userId`
    // too, which made the leader branch unreachable — a band leader who does
    // not own the row they were promoting got a 404 and could never grant or
    // revoke the isLeader flag.
    const currentMember = await prisma.bandMember.findUnique({
      where: { id: params.id },
      select: { id: true, userId: true, bands: true },
    });
    if (!currentMember) {
      return NextResponse.json({ error: "Band member not found" }, { status: 404 });
    }
    const isOwner = currentMember.userId === user.id;
    if (!isOwner) {
      let isLeaderOfBand = false;
      if (Array.isArray(currentMember.bands)) {
        for (const bandName of currentMember.bands) {
          const band = await prisma.bands.findFirst({
            where: { name: bandName },
            select: { id: true },
          });
          if (band && (await isBandLeaderOrOwner(band.id, user.id))) {
            isLeaderOfBand = true;
            break;
          }
        }
      }
      if (!isLeaderOfBand) {
        return NextResponse.json(
          { error: "Forbidden: Only band leaders or owners can edit this member" },
          { status: 403 }
        );
      }
    }

    // Re-link on e-mail change: claim an existing account with the new address,
    // and keep the member unclaimed if nobody has registered with it yet.
    const nextEmail = email !== undefined ? email?.trim() || null : undefined;
    const resolvedUserId =
      nextEmail !== undefined
        ? await resolveMemberUserId(params.id, nextEmail, user.id)
        : currentMember.userId;

    const bandMember = await prisma.bandMember.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(email !== undefined && { email: email?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
        ...(body.isLeader !== undefined && { isLeader: Boolean(body.isLeader) }),
        ...(avatarUrl !== undefined && {
          avatarUrl: typeof avatarUrl === "string" && avatarUrl.trim() ? avatarUrl.trim() : null,
        }),
        ...(bands !== undefined && { bands }),
        ...(resolvedUserId !== currentMember.userId && { userId: resolvedUserId }),
      },
    });

    invalidateCache(`${user.id}:band-members`);
    return NextResponse.json(bandMember);
  } catch (error: any) {
    console.error("PATCH /api/band-members/[id] error:", error);

    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "A band member with this name already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to update band member" },
      { status: 500 }
    );
  }
}

// DELETE /api/band-members/[id] - Delete band member
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authResult = await requireAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const { user } = authResult as { user: { id: string } };

    // Check ownership
    const existing = await prisma.bandMember.findFirst({
      where: {
        id: params.id,
        userId: user.id,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Band member not found" },
        { status: 404 }
      );
    }

    await prisma.bandMember.delete({
      where: { id: params.id },
    });

    invalidateCache(`${user.id}:band-members`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/band-members/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete band member" },
      { status: 500 }
    );
  }
}
