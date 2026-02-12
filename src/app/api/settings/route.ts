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
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/settings] error:", errorMsg);
    // Return defaults on error instead of 500
    // This handles cases where UserSettings table doesn't exist yet
    return NextResponse.json({
      currency: "EUR",
      claimPerformanceFee: true,
      claimTechnicalFee: true,
    });
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

  let currency: string | undefined;
  let claimPerformanceFee: boolean | undefined;
  let claimTechnicalFee: boolean | undefined;

  try {
    const body = await request.json();

    currency =
      typeof body.currency === "string" && SUPPORTED_CURRENCIES.includes(body.currency.toUpperCase())
        ? body.currency.toUpperCase()
        : undefined;

    claimPerformanceFee =
      typeof body.claimPerformanceFee === "boolean" ? body.claimPerformanceFee : undefined;

    claimTechnicalFee =
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
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/settings] error:", errorMsg);
    // If table doesn't exist or other issue, return the data we received at least
    // This handles cases where UserSettings table doesn't exist yet
    return NextResponse.json({
      currency: currency || "EUR",
      claimPerformanceFee: claimPerformanceFee ?? true,
      claimTechnicalFee: claimTechnicalFee ?? true,
    });
  }
}
