import { NextRequest, NextResponse } from "next/server";
import { getUserIdFromHeader } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

// GET /api/band-members/[id] - Get single band member
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getUserIdFromHeader(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const bandMember = await prisma.bandMember.findFirst({
      where: {
        id: params.id,
        userId: userId,
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
    const userId = await getUserIdFromHeader(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check ownership
    const existing = await prisma.bandMember.findFirst({
      where: {
        id: params.id,
        userId: userId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Band member not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { name, email, phone, notes } = body;

    const bandMember = await prisma.bandMember.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(email !== undefined && { email: email?.trim() || null }),
        ...(phone !== undefined && { phone: phone?.trim() || null }),
        ...(notes !== undefined && { notes: notes?.trim() || null }),
      },
    });

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
    const userId = await getUserIdFromHeader(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check ownership
    const existing = await prisma.bandMember.findFirst({
      where: {
        id: params.id,
        userId: userId,
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/band-members/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete band member" },
      { status: 500 }
    );
  }
}
