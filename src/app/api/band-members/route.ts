import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromHeader } from "@/lib/auth-helpers";

// GET /api/band-members - List all band members for current user
export async function GET(req: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get all band members for this user with their gig participation
    const bandMembers = await prisma.bandMember.findMany({
      where: { userId },
      include: {
        gigs: {
          include: {
            gig: {
              select: {
                id: true,
                eventName: true,
                date: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    // Calculate totals for each band member
    const bandMembersWithTotals = bandMembers.map((member) => {
      const totalEarned = member.gigs.reduce(
        (sum, g) => sum + (g.earnedAmount || 0),
        0
      );
      const totalPaid = member.gigs.reduce(
        (sum, g) => sum + (g.paidAmount || 0),
        0
      );
      const totalOwed = totalEarned - totalPaid;

      return {
        id: member.id,
        name: member.name,
        email: member.email,
        phone: member.phone,
        notes: member.notes,
        totalEarned,
        totalPaid,
        totalOwed,
        gigsCount: member.gigs.length,
        gigs: member.gigs.map((g) => ({
          gigId: g.gig.id,
          gigName: g.gig.eventName,
          gigDate: g.gig.date,
          earned: g.earnedAmount,
          paid: g.paidAmount,
        })),
      };
    });

    return NextResponse.json(bandMembersWithTotals);
  } catch (error) {
    console.error("GET /api/band-members error:", error);
    return NextResponse.json(
      { error: "Failed to fetch band members" },
      { status: 500 }
    );
  }
}

// POST /api/band-members - Create a new band member
export async function POST(req: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(req);

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, email, phone, notes } = body;

    if (!name || name.trim() === "") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Create band member
    const bandMember = await prisma.bandMember.create({
      data: {
        name: name.trim(),
        email: email?.trim() || null,
        phone: phone?.trim() || null,
        notes: notes?.trim() || null,
        userId,
      },
    });

    return NextResponse.json(bandMember, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/band-members error:", error);
    
    // Handle unique constraint violation
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "A band member with this name already exists" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create band member" },
      { status: 500 }
    );
  }
}
