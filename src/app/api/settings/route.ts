import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getUserIdFromHeader, getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

// ── Auth helper (same pattern as gigs routes) ─────────────────────────────────

async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const token = authHeader.slice(7);

  try {
    const {
      data: { user: supabaseUser },
      error,
    } = await supabaseAdmin.auth.getUser(token);

    if (error || !supabaseUser) {
      return { error: NextResponse.json({ error: "Invalid token" }, { status: 401 }) };
    }

    const user = await getOrCreateUser(
      supabaseUser.id,
      supabaseUser.email || "",
      supabaseUser.user_metadata?.name
    );

    return { user };
  } catch {
    return { error: NextResponse.json({ error: "Auth error" }, { status: 500 }) };
  }
}

// ── GET /api/settings — return user settings (or defaults) ────────────────────

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    let settings = await prisma.userSettings.findUnique({
      where: { userId: auth.user.id },
    });

    if (!settings) {
      // Return defaults without persisting yet
      return NextResponse.json({
        currency: "EUR",
        claimPerformanceFee: true,
        claimTechnicalFee: true,
      });
    }

    return NextResponse.json({
      currency: settings.currency,
      claimPerformanceFee: settings.claimPerformanceFee,
      claimTechnicalFee: settings.claimTechnicalFee,
    });
  } catch (err) {
    console.error("GET /api/settings error:", err);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

// ── PUT /api/settings — upsert user settings ─────────────────────────────────

const SUPPORTED_CURRENCIES = [
  "EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK",
  "PLN", "CZK", "HUF", "CAD", "AUD", "JPY",
];

export async function PUT(request: NextRequest) {
  const auth = await requireAuth(request);
  if ("error" in auth) return auth.error;

  try {
    const body = await request.json();

    const currency =
      typeof body.currency === "string" && SUPPORTED_CURRENCIES.includes(body.currency.toUpperCase())
        ? body.currency.toUpperCase()
        : undefined;

    const claimPerformanceFee =
      typeof body.claimPerformanceFee === "boolean" ? body.claimPerformanceFee : undefined;

    const claimTechnicalFee =
      typeof body.claimTechnicalFee === "boolean" ? body.claimTechnicalFee : undefined;

    const data: Record<string, any> = {};
    if (currency !== undefined) data.currency = currency;
    if (claimPerformanceFee !== undefined) data.claimPerformanceFee = claimPerformanceFee;
    if (claimTechnicalFee !== undefined) data.claimTechnicalFee = claimTechnicalFee;

    const settings = await prisma.userSettings.upsert({
      where: { userId: auth.user.id },
      update: data,
      create: {
        userId: auth.user.id,
        currency: currency ?? "EUR",
        claimPerformanceFee: claimPerformanceFee ?? true,
        claimTechnicalFee: claimTechnicalFee ?? true,
      },
    });

    return NextResponse.json({
      currency: settings.currency,
      claimPerformanceFee: settings.claimPerformanceFee,
      claimTechnicalFee: settings.claimTechnicalFee,
    });
  } catch (err) {
    console.error("PUT /api/settings error:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
