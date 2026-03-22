import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAuthUser } from "@/lib/api-auth";
import {
  generateShareToken,
  normalizeShareLinkVisibility,
} from "@/lib/share-links";

interface CreateShareLinkBody {
  title?: string;
  expiresAt?: string | null;
  password?: string | null;
  visibility?: unknown;
  gigIds?: string[];
  selectionMode?: "all" | "artist" | "individual";
  selectedArtists?: string[];
}

async function createUniqueShareToken() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = generateShareToken(18);
    const existing = await prisma.shareLink.findUnique({ where: { token } });
    if (!existing) return token;
  }

  throw new Error("Unable to generate unique share token");
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuthUser(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  try {
    const links = await prisma.shareLink.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { gigs: true },
        },
      },
    });

    const dynamicCounts = await Promise.all(
      links.map(async (link) => {
        if (!link.autoIncludeNewGigs) {
          return [link.id, link._count.gigs] as const;
        }

        if (link.selectionMode === "all") {
          const count = await prisma.gig.count({ where: { userId: link.userId } });
          return [link.id, count] as const;
        }

        if (link.selectionMode === "artist") {
          if (link.includeArtists.length === 0) {
            return [link.id, 0] as const;
          }

          const count = await prisma.gig.count({
            where: {
              userId: link.userId,
              performers: { in: link.includeArtists },
            },
          });

          return [link.id, count] as const;
        }

        return [link.id, link._count.gigs] as const;
      })
    );

    const countByLinkId = new Map(dynamicCounts);

    const now = new Date();
    return NextResponse.json(
      links.map((link) => ({
        id: link.id,
        token: link.token,
        title: link.title,
        createdAt: link.createdAt,
        expiresAt: link.expiresAt,
        passwordProtected: Boolean(link.passwordHash),
        gigCount: countByLinkId.get(link.id) ?? link._count.gigs,
        selectionMode: link.selectionMode,
        autoIncludeNewGigs: link.autoIncludeNewGigs,
        isExpired: Boolean(link.expiresAt && link.expiresAt < now),
      }))
    );
  } catch (error) {
    console.error("[GET /api/share-links]", error);
    return NextResponse.json(
      { error: "Failed to fetch share links" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthUser(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult;

  try {
    const body = (await request.json()) as CreateShareLinkBody;
    const gigIds = Array.isArray(body.gigIds)
      ? body.gigIds.filter((gigId): gigId is string => typeof gigId === "string")
      : [];

    const selectionMode =
      body.selectionMode === "all" ||
      body.selectionMode === "artist" ||
      body.selectionMode === "individual"
        ? body.selectionMode
        : "individual";

    const selectedArtists = Array.isArray(body.selectedArtists)
      ? Array.from(
          new Set(
            body.selectedArtists
              .filter((artist): artist is string => typeof artist === "string")
              .map((artist) => artist.trim())
              .filter(Boolean)
          )
        )
      : [];

    if (gigIds.length === 0) {
      return NextResponse.json(
        { error: "At least one gig is required" },
        { status: 400 }
      );
    }

    if (selectionMode === "artist" && selectedArtists.length === 0) {
      return NextResponse.json(
        { error: "Select at least one artist for artist mode" },
        { status: 400 }
      );
    }

    const gigs = await prisma.gig.findMany({
      where: {
        id: { in: gigIds },
        userId: user.id,
      },
      select: { id: true },
    });

    if (gigs.length !== new Set(gigIds).size) {
      return NextResponse.json(
        { error: "One or more gigs were not found or not owned by user" },
        { status: 403 }
      );
    }

    const visibility = normalizeShareLinkVisibility(body.visibility);

    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json(
          { error: "Invalid expiration date" },
          { status: 400 }
        );
      }
      expiresAt = parsed;
    }

    const password = body.password?.trim();
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    const token = await createUniqueShareToken();

    const created = await prisma.shareLink.create({
      data: {
        token,
        title: body.title?.trim() || null,
        expiresAt,
        passwordHash,
        visibility: { ...visibility } as Prisma.InputJsonObject,
        selectionMode,
        includeArtists: selectionMode === "artist" ? selectedArtists : [],
        autoIncludeNewGigs: selectionMode !== "individual",
        userId: user.id,
        gigs: {
          create: gigIds.map((gigId) => ({
            gigId,
          })),
        },
      },
      include: {
        _count: {
          select: { gigs: true },
        },
      },
    });

    return NextResponse.json(
      {
        id: created.id,
        token: created.token,
        title: created.title,
        createdAt: created.createdAt,
        expiresAt: created.expiresAt,
        passwordProtected: Boolean(created.passwordHash),
        gigCount: created._count.gigs,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/share-links]", error);
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    );
  }
}
