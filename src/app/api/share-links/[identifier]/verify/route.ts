import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  clearShareLinkVerifyFailures,
  getRateLimitKey,
  isShareLinkVerifyBlocked,
  recordShareLinkVerifyFailure,
} from "@/lib/share-link-rate-limit";

function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}

export async function POST(
  request: NextRequest,
  { params }: { params: { identifier: string } }
) {
  const token = params.identifier;

  try {
    const link = await prisma.shareLink.findUnique({
      where: { token },
      select: {
        token: true,
        passwordHash: true,
        expiresAt: true,
      },
    });

    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    if (link.expiresAt && link.expiresAt < new Date()) {
      return NextResponse.json(
        { expired: true, message: "This link has expired." },
        { status: 410 }
      );
    }

    if (!link.passwordHash) {
      const response = NextResponse.json({ verified: true });
      response.cookies.set({
        name: `share_link_verified_${link.token}`,
        value: "1",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24,
        path: "/",
      });
      return response;
    }

    const ipAddress = getRequestIp(request);
    const rateKey = getRateLimitKey(token, ipAddress);
    const blockedState = isShareLinkVerifyBlocked(rateKey);

    if (blockedState.blocked) {
      return NextResponse.json(
        {
          error: "Too many attempts. Try again later.",
          retryAfterSeconds: blockedState.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(blockedState.retryAfterSeconds),
          },
        }
      );
    }

    const body = (await request.json()) as { password?: string };
    const password = body.password?.trim();

    if (!password) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(password, link.passwordHash);

    if (!valid) {
      const failure = recordShareLinkVerifyFailure(rateKey);
      return NextResponse.json(
        {
          error: "Invalid password",
          remainingAttempts: failure.remaining,
          retryAfterSeconds: failure.retryAfterSeconds,
        },
        { status: failure.blocked ? 429 : 401 }
      );
    }

    clearShareLinkVerifyFailures(rateKey);

    const response = NextResponse.json({ verified: true });
    response.cookies.set({
      name: `share_link_verified_${link.token}`,
      value: "1",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24,
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("[POST /api/share-links/[identifier]/verify]", error);
    return NextResponse.json(
      { error: "Failed to verify share link" },
      { status: 500 }
    );
  }
}
