import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getUserIdFromHeader } from "@/lib/auth-helpers";

function uniqueContributorIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((item) => String(item).trim())
        .filter(Boolean)
    )
  );
}

// GET: Fetch all investments for the current user
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserIdFromHeader(request);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { supabaseId: userId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const investments = await prisma.$queryRaw<
      Array<{
        id: string;
        amount: number;
        sharedWithMusician: boolean;
        description: string | null;
        date: Date;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(Prisma.sql`
      SELECT
        id,
        amount,
        "sharedWithMusician",
        description,
        date,
        "userId",
        "createdAt",
        "updatedAt"
      FROM "Investment"
      WHERE "userId" = ${user.id}
      ORDER BY date DESC
    `);

    const contributorRows = await prisma.$queryRaw<
      Array<{
        id: string;
        investmentId: string;
        bandMemberId: string;
        bandMemberName: string;
      }>
    >(Prisma.sql`
      SELECT
        ic.id,
        ic."investmentId" AS "investmentId",
        ic."bandMemberId" AS "bandMemberId",
        bm.name AS "bandMemberName"
      FROM "InvestmentContributor" ic
      INNER JOIN "Investment" i ON i.id = ic."investmentId"
      INNER JOIN "BandMember" bm ON bm.id = ic."bandMemberId"
      WHERE i."userId" = ${user.id}
      ORDER BY ic."createdAt" ASC
    `);

    const contributorsByInvestmentId = new Map<string, Array<{
      id: string;
      bandMemberId: string;
      bandMember: { id: string; name: string };
    }>>();

    for (const row of contributorRows) {
      const list = contributorsByInvestmentId.get(row.investmentId) ?? [];
      list.push({
        id: row.id,
        bandMemberId: row.bandMemberId,
        bandMember: {
          id: row.bandMemberId,
          name: row.bandMemberName,
        },
      });
      contributorsByInvestmentId.set(row.investmentId, list);
    }

    return NextResponse.json(
      investments.map((investment) => ({
        ...investment,
        contributors: contributorsByInvestmentId.get(investment.id) ?? [],
      }))
    );
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
    const { amount, description, date, sharedWithMusician, contributorIds } = body;
    const selectedContributorIds = uniqueContributorIds(contributorIds);

    if (amount === undefined || amount === null) {
      return NextResponse.json(
        { error: "Amount is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { supabaseId: userId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const validBandMembers = selectedContributorIds.length > 0
      ? await prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
          SELECT id
          , name
          FROM "BandMember"
          WHERE "userId" = ${user.id}
            AND id IN (${Prisma.join(selectedContributorIds)})
        `)
      : [];

    const validContributorIds = validBandMembers.map((member) => member.id);
    const shouldMarkShared = Boolean(sharedWithMusician) || validContributorIds.length > 0;

    const insertedInvestment = await prisma.$queryRaw<
      Array<{
        id: string;
        amount: number;
        sharedWithMusician: boolean;
        description: string | null;
        date: Date;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(Prisma.sql`
      INSERT INTO "Investment" (
        id,
        amount,
        "sharedWithMusician",
        description,
        date,
        "userId",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        ${crypto.randomUUID()},
        ${Number(amount)},
        ${shouldMarkShared},
        ${description || null},
        ${date ? new Date(date) : new Date()},
        ${user.id},
        NOW(),
        NOW()
      )
      RETURNING id, amount, "sharedWithMusician", description, date, "userId", "createdAt", "updatedAt"
    `);

    const investment = insertedInvestment[0];

    if (investment && validContributorIds.length > 0) {
      for (const bandMemberId of validContributorIds) {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO "InvestmentContributor" (id, "investmentId", "bandMemberId", "createdAt")
          VALUES (${crypto.randomUUID()}, ${investment.id}, ${bandMemberId}, NOW())
          ON CONFLICT ("investmentId", "bandMemberId") DO NOTHING
        `);
      }
    }

    const contributors = validBandMembers.map((member) => ({
      id: crypto.randomUUID(),
      bandMemberId: member.id,
      bandMember: { id: member.id, name: member.name },
    }));

    return NextResponse.json(
      {
        ...investment,
        contributors,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/investments error:", error);
    return NextResponse.json(
      { error: "Failed to create investment" },
      { status: 500 }
    );
  }
}

// PATCH: Update an existing investment
export async function PATCH(request: NextRequest) {
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

    const body = await request.json();
    const { amount, description, date, sharedWithMusician, contributorIds } = body;
    const selectedContributorIds = uniqueContributorIds(contributorIds);

    if (amount === undefined || amount === null) {
      return NextResponse.json(
        { error: "Amount is required" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { supabaseId: userId },
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const existing = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM "Investment"
      WHERE id = ${investmentId}
        AND "userId" = ${user.id}
      LIMIT 1
    `);

    if (existing.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const validBandMembers = selectedContributorIds.length > 0
      ? await prisma.$queryRaw<Array<{ id: string; name: string }>>(Prisma.sql`
          SELECT id
          , name
          FROM "BandMember"
          WHERE "userId" = ${user.id}
            AND id IN (${Prisma.join(selectedContributorIds)})
        `)
      : [];

    const validContributorIds = validBandMembers.map((member) => member.id);
    const shouldMarkShared = Boolean(sharedWithMusician) || validContributorIds.length > 0;

    const updatedInvestment = await prisma.$queryRaw<
      Array<{
        id: string;
        amount: number;
        sharedWithMusician: boolean;
        description: string | null;
        date: Date;
        userId: string;
        createdAt: Date;
        updatedAt: Date;
      }>
    >(Prisma.sql`
      UPDATE "Investment"
      SET
        amount = ${Number(amount)},
        "sharedWithMusician" = ${shouldMarkShared},
        description = ${description || null},
        date = ${date ? new Date(date) : new Date()},
        "updatedAt" = NOW()
      WHERE id = ${investmentId}
        AND "userId" = ${user.id}
      RETURNING id, amount, "sharedWithMusician", description, date, "userId", "createdAt", "updatedAt"
    `);

    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "InvestmentContributor"
      WHERE "investmentId" = ${investmentId}
    `);

    for (const bandMemberId of validContributorIds) {
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "InvestmentContributor" (id, "investmentId", "bandMemberId", "createdAt")
        VALUES (${crypto.randomUUID()}, ${investmentId}, ${bandMemberId}, NOW())
      `);
    }

    return NextResponse.json({
      ...updatedInvestment[0],
      contributors: validBandMembers.map((member) => ({
        id: crypto.randomUUID(),
        bandMemberId: member.id,
        bandMember: {
          id: member.id,
          name: member.name,
        },
      })),
    });
  } catch (error) {
    console.error("PATCH /api/investments error:", error);
    return NextResponse.json(
      { error: "Failed to update investment" },
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
      select: { id: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify the investment belongs to the user
    const investment = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id
      FROM "Investment"
      WHERE id = ${investmentId}
        AND "userId" = ${user.id}
      LIMIT 1
    `);

    if (investment.length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await prisma.$executeRaw(Prisma.sql`
      DELETE FROM "Investment"
      WHERE id = ${investmentId}
        AND "userId" = ${user.id}
    `);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/investments error:", error);
    return NextResponse.json(
      { error: "Failed to delete investment" },
      { status: 500 }
    );
  }
}
