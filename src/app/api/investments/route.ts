import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromHeader } from "@/lib/auth-helpers";

// GET: Fetch all investments for the current user
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { supabaseId: userId },
      include: { investments: { orderBy: { date: "desc" } } },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json(user.investments);
  } catch (error) {
    console.error("GET /api/investments error:", error);
    return NextResponse.json(
      { error: "Failed to fetch investments" },
      { status: 500 }
    );
  }
}

// POST: Create a new investment
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { amount, description, date } = body;

    if (amount === undefined || amount === null) {
      return NextResponse.json(
        { error: "Amount is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { supabaseId: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const investment = await prisma.investment.create({
      data: {
        amount: Number(amount),
        description: description || null,
        date: date ? new Date(date) : new Date(),
        userId: user.id,
      },
    });

    return NextResponse.json(investment, { status: 201 });
  } catch (error) {
    console.error("POST /api/investments error:", error);
    return NextResponse.json(
      { error: "Failed to create investment" },
      { status: 500 }
    );
  }
}

// DELETE: Delete an investment by ID
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const investmentId = searchParams.get("id");

    if (!investmentId) {
      return NextResponse.json(
        { error: "Investment ID is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { supabaseId: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify the investment belongs to the user
    const investment = await prisma.investment.findUnique({
      where: { id: investmentId },
    });

    if (!investment || investment.userId !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.investment.delete({
      where: { id: investmentId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/investments error:", error);
    return NextResponse.json(
      { error: "Failed to delete investment" },
      { status: 500 }
    );
  }
}
