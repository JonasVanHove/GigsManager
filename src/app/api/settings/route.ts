/**
 * PRODUCTION-SAFE VERSION: /api/settings
 * 
 * Critical fixes:
 * 1. Validates environment variables at route start
 * 2. Wraps ALL operations in outer try/catch
 * 3. Graceful degradation with defaults instead of 500s
 * 4. No unhandled exceptions from imports or Prisma
 * 5. Proper error logging without exposing secrets
 */

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_SETTINGS = {
  currency: "EUR",
  claimPerformanceFee: true,
  claimTechnicalFee: true,
  theme: "system",
  customTab1: "setlists",
  customTab2: "songs",
  overviewViewMode: "grid",
  pdfIncludeLogo: true,
  pdfFont: "inter",
  pdfPageSize: "a4",
  pdfPageBreakMode: "auto",
  pdfDarkMode: false,
  pdfShowHeaders: true,
  pdfShowMetadata: true,
  pdfImagesOnly: false,
  pdfShowPageNumbers: true,
  pdfMarginSize: "medium",
  excludeSelfFromMemberCount: false,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENT VALIDATION (runs once at route invocation)
// ─────────────────────────────────────────────────────────────────────────────

function validateEnvironment() {
  const missingVars: string[] = [];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    missingVars.push("NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missingVars.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!process.env.DATABASE_URL) {
    missingVars.push("DATABASE_URL");
  }

  if (missingVars.length > 0) {
    console.error("[Settings] Missing environment variables:", missingVars.join(", "));
    return { isValid: false, missingVars };
  }

  return { isValid: true, missingVars: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// SAFE IMPORTS WITH ERROR HANDLING
// ─────────────────────────────────────────────────────────────────────────────

async function safeImportPrisma() {
  try {
    const mod = await import("@/lib/prisma");
    if (!mod || !mod.prisma) {
      console.error("[Settings] Prisma import failed: module missing prisma export");
      return null;
    }
    return mod.prisma;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Settings] Failed to import Prisma:", errMsg);
    return null;
  }
}

async function safeImportSupabaseAdmin() {
  try {
    const mod = await import("@/lib/supabase-admin");
    if (!mod || !mod.supabaseAdmin) {
      console.error("[Settings] Supabase import failed: module missing supabaseAdmin export");
      return null;
    }
    return mod.supabaseAdmin;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Settings] Failed to import Supabase admin:", errMsg);
    return null;
  }
}

async function safeImportGetOrCreateUser() {
  try {
    const mod = await import("@/lib/auth-helpers");
    if (!mod || !mod.getOrCreateUser) {
      console.error("[Settings] Auth helpers import failed: module missing getOrCreateUser export");
      return null;
    }
    return mod.getOrCreateUser;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Settings] Failed to import auth helpers:", errMsg);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH TOKEN PARSING
// ─────────────────────────────────────────────────────────────────────────────

function extractBearerToken(request: NextRequest): string | null {
  try {
    const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return null;
    }
    return authHeader.slice(7);
  } catch (err) {
    console.error("[Settings] Failed to extract bearer token:", err);
    return null;
  }
}

function decodeJWTPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const decoded = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch (err) {
    console.error("[Settings] Failed to decode JWT:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION HANDLER
// ─────────────────────────────────────────────────────────────────────────────

interface AuthSuccess {
  type: "success";
  userId: string;
}

interface AuthDegraded {
  type: "degraded";
}

interface AuthError {
  type: "error";
  status: number;
  message: string;
}

type AuthResult = AuthSuccess | AuthDegraded | AuthError;

async function requireAuth(
  request: NextRequest,
  supabaseAdmin: any,
  getOrCreateUser: any
): Promise<AuthResult> {
  const token = extractBearerToken(request);

  if (!token) {
    console.warn("[Settings Auth] Missing authorization token");
    return { type: "error", status: 401, message: "Missing authorization token" };
  }

  try {
    // Strategy 1: Decode JWT locally (fast, doesn't require Supabase)
    console.log("[Settings Auth] Attempting local JWT decode...");
    const jwtPayload = decodeJWTPayload(token);

    if (jwtPayload && jwtPayload.sub) {
      console.log("[Settings Auth] JWT decoded, userId:", jwtPayload.sub);

      // Try to get or create the user in app database
      try {
        console.log("[Settings Auth] Creating/retrieving user from JWT data...");
        const user = await getOrCreateUser(
          jwtPayload.sub,
          jwtPayload.email || "",
          jwtPayload.name || null
        );

        if (!user || !user.id) {
          console.error("[Settings Auth] User creation returned invalid user object:", user);
          return { type: "degraded" };
        }

        console.log("[Settings Auth] ✓ User ready, id:", user.id, "email:", user.email);
        return { type: "success", userId: user.id };
      } catch (dbErr) {
        const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        console.error("[Settings Auth] Database error during user creation:", errMsg);
        // Database unavailable but token is valid → degrade gracefully
        return { type: "degraded" };
      }
    }

    // Strategy 2: Validate via Supabase admin API (slower, requires network)
    console.log("[Settings Auth] Local JWT decode failed, trying Supabase admin API...");

    if (!supabaseAdmin || !supabaseAdmin.auth || typeof supabaseAdmin.auth.getUser !== "function") {
      console.error("[Settings Auth] Supabase admin client not available");
      return { type: "error", status: 503, message: "Service unavailable" };
    }

    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);

      if (error) {
        console.warn("[Settings Auth] Supabase getUser returned error:", error.message);
        return { type: "error", status: 401, message: "Invalid token" };
      }

      if (!data?.user?.id) {
        console.warn("[Settings Auth] Supabase returned no user data");
        return { type: "error", status: 401, message: "User not found" };
      }

      // User validated, now sync to app database
      try {
        console.log("[Settings Auth] Syncing user to app database...");
        const user = await getOrCreateUser(data.user.id, data.user.email || "", data.user.user_metadata?.name || null);

        if (!user || !user.id) {
          console.error("[Settings Auth] User sync returned invalid user object");
          return { type: "degraded" };
        }

        console.log("[Settings Auth] User synced:", user.id);
        return { type: "success", userId: user.id };
      } catch (dbErr) {
        const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        console.error("[Settings Auth] Failed to sync user to database:", errMsg);
        return { type: "degraded" };
      }
    } catch (supabaseErr) {
      const errMsg = supabaseErr instanceof Error ? supabaseErr.message : String(supabaseErr);
      console.error("[Settings Auth] Supabase API call failed:", errMsg);
      return { type: "error", status: 503, message: "Authentication service unavailable" };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Settings Auth] Unexpected error:", errMsg);
    return { type: "error", status: 500, message: "Internal server error" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/settings
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  console.log("[GET /api/settings] Starting");

  // Outer error boundary: catch ANY unhandled error
  try {
    // 1. Validate environment first
    const envCheck = validateEnvironment();
    if (!envCheck.isValid) {
      console.error("[GET /api/settings] Environment validation failed");
      // Return defaults rather than 500 - user won't have broken app
      return NextResponse.json(DEFAULT_SETTINGS, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // 2. Safe import of dependencies
    const prisma = await safeImportPrisma();
    const supabaseAdmin = await safeImportSupabaseAdmin();
    const getOrCreateUser = await safeImportGetOrCreateUser();

    if (!prisma || !supabaseAdmin || !getOrCreateUser) {
      console.error("[GET /api/settings] Failed to import required modules");
      return NextResponse.json(DEFAULT_SETTINGS, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // 3. Authenticate
    console.log("[GET /api/settings] Authenticating...");
    const authResult = await requireAuth(request, supabaseAdmin, getOrCreateUser);

    if (authResult.type === "error") {
      console.warn("[GET /api/settings] Auth failed with status", authResult.status);
      return NextResponse.json(
        { error: authResult.message },
        { status: authResult.status }
      );
    }

    if (authResult.type === "degraded") {
      console.warn("[GET /api/settings] Auth degraded, returning defaults");
      return NextResponse.json(DEFAULT_SETTINGS, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    // 4. Query database
    const userId = authResult.userId;
    console.log("[GET /api/settings] Querying database for userId:", userId);

    try {
      const settings = await prisma.userSettings.findUnique({
        where: { userId },
      });

      if (!settings) {
        console.log("[GET /api/settings] No settings found, returning defaults");
        return NextResponse.json(DEFAULT_SETTINGS);
      }

      console.log("[GET /api/settings] Settings found, returning");
      const settingsData: any = settings;
      return NextResponse.json({
        currency: settings.currency || DEFAULT_SETTINGS.currency,
        claimPerformanceFee: settings.claimPerformanceFee ?? DEFAULT_SETTINGS.claimPerformanceFee,
        claimTechnicalFee: settings.claimTechnicalFee ?? DEFAULT_SETTINGS.claimTechnicalFee,
        theme: settings.theme || DEFAULT_SETTINGS.theme,
        customTab1: settingsData.customTab1 || DEFAULT_SETTINGS.customTab1,
        customTab2: settingsData.customTab2 || DEFAULT_SETTINGS.customTab2,
        overviewViewMode: (settingsData.overviewViewMode === "compact" ? "compact" : "grid"),
        pdfIncludeLogo: settingsData.pdfIncludeLogo ?? DEFAULT_SETTINGS.pdfIncludeLogo,
        pdfFont: settingsData.pdfFont || DEFAULT_SETTINGS.pdfFont,
        pdfPageSize: settingsData.pdfPageSize || DEFAULT_SETTINGS.pdfPageSize,
        pdfPageBreakMode: settingsData.pdfPageBreakMode || DEFAULT_SETTINGS.pdfPageBreakMode,
        pdfDarkMode: settingsData.pdfDarkMode ?? DEFAULT_SETTINGS.pdfDarkMode,
        pdfShowHeaders: settingsData.pdfShowHeaders ?? DEFAULT_SETTINGS.pdfShowHeaders,
        pdfShowMetadata: settingsData.pdfShowMetadata ?? DEFAULT_SETTINGS.pdfShowMetadata,
        pdfImagesOnly: settingsData.pdfImagesOnly ?? DEFAULT_SETTINGS.pdfImagesOnly,
        pdfShowPageNumbers: settingsData.pdfShowPageNumbers ?? DEFAULT_SETTINGS.pdfShowPageNumbers,
        pdfMarginSize: settingsData.pdfMarginSize || DEFAULT_SETTINGS.pdfMarginSize,
      });
    } catch (dbErr) {
      const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error("[GET /api/settings] Database query failed:", errMsg);
      // Database error but auth succeeded - return defaults
      return NextResponse.json(DEFAULT_SETTINGS, {
        headers: { "Cache-Control": "private, no-store" },
      });
    }
  } catch (err) {
    // Final catch-all: ANY unhandled exception
    const errMsg = err instanceof Error ? err.message : String(err);
    const errName = err instanceof Error ? err.name : "Unknown";
    console.error("[GET /api/settings] FATAL UNHANDLED ERROR:", errName, "→", errMsg);

    // Return defaults instead of 500
    return NextResponse.json(DEFAULT_SETTINGS, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/settings
// ─────────────────────────────────────────────────────────────────────────────

const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "CAD", "AUD", "JPY"];
const VALID_THEMES = ["light", "dark", "system"];
const VALID_PDF_FONTS = ["inter", "arial", "times", "georgia", "courier"];
const VALID_PDF_SIZES = ["a4", "letter", "legal"];
const VALID_PDF_PAGE_BREAKS = ["auto", "song", "section", "none"];
const VALID_PDF_MARGINS = ["small", "medium", "large"];
const VALID_CUSTOM_TABS = ["setlists", "songs", "calendar", "bands", "band-members", "analytics", "investments", "shared-links"];
const VALID_OVERVIEW_VIEW_MODES = ["grid", "compact"];

export async function PUT(request: NextRequest) {
  console.log("[PUT /api/settings] Starting");

  try {
    // 1. Validate environment
    const envCheck = validateEnvironment();
    if (!envCheck.isValid) {
      console.error("[PUT /api/settings] Environment validation failed");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // 2. Safe imports
    const prisma = await safeImportPrisma();
    const supabaseAdmin = await safeImportSupabaseAdmin();
    const getOrCreateUser = await safeImportGetOrCreateUser();

    if (!prisma || !supabaseAdmin || !getOrCreateUser) {
      console.error("[PUT /api/settings] Failed to import required modules");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // 3. Parse request body safely
    let body: Record<string, any>;
    try {
      body = await request.json();
    } catch (parseErr) {
      console.warn("[PUT /api/settings] Invalid JSON in request body");
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
    }

    // 4. Validate and sanitize input
    const currency =
      typeof body.currency === "string" && SUPPORTED_CURRENCIES.includes(body.currency.toUpperCase())
        ? body.currency.toUpperCase()
        : undefined;

    const claimPerformanceFee = typeof body.claimPerformanceFee === "boolean" ? body.claimPerformanceFee : undefined;
    const claimTechnicalFee = typeof body.claimTechnicalFee === "boolean" ? body.claimTechnicalFee : undefined;
    const theme = typeof body.theme === "string" && VALID_THEMES.includes(body.theme) ? body.theme : undefined;

    // PDF settings validation
    const pdfIncludeLogo = typeof body.pdfIncludeLogo === "boolean" ? body.pdfIncludeLogo : undefined;
    const pdfFont = typeof body.pdfFont === "string" && VALID_PDF_FONTS.includes(body.pdfFont) ? body.pdfFont : undefined;
    const pdfPageSize = typeof body.pdfPageSize === "string" && VALID_PDF_SIZES.includes(body.pdfPageSize) ? body.pdfPageSize : undefined;
    const pdfPageBreakMode = typeof body.pdfPageBreakMode === "string" && VALID_PDF_PAGE_BREAKS.includes(body.pdfPageBreakMode) ? body.pdfPageBreakMode : undefined;
    const pdfDarkMode = typeof body.pdfDarkMode === "boolean" ? body.pdfDarkMode : undefined;
    const pdfShowHeaders = typeof body.pdfShowHeaders === "boolean" ? body.pdfShowHeaders : undefined;
    const pdfShowMetadata = typeof body.pdfShowMetadata === "boolean" ? body.pdfShowMetadata : undefined;
    const pdfImagesOnly = typeof body.pdfImagesOnly === "boolean" ? body.pdfImagesOnly : undefined;
    const pdfShowPageNumbers = typeof body.pdfShowPageNumbers === "boolean" ? body.pdfShowPageNumbers : undefined;
    const pdfMarginSize = typeof body.pdfMarginSize === "string" && VALID_PDF_MARGINS.includes(body.pdfMarginSize) ? body.pdfMarginSize : undefined;
    const excludeSelfFromMemberCount = typeof body.excludeSelfFromMemberCount === "boolean" ? body.excludeSelfFromMemberCount : undefined;

    // Custom Navigation Tabs validation
    const customTab1 = typeof body.customTab1 === "string" && VALID_CUSTOM_TABS.includes(body.customTab1) ? body.customTab1 : undefined;
    const customTab2 = typeof body.customTab2 === "string" && VALID_CUSTOM_TABS.includes(body.customTab2) ? body.customTab2 : undefined;

    // Overview view-mode validation
    const overviewViewMode = typeof body.overviewViewMode === "string" && VALID_OVERVIEW_VIEW_MODES.includes(body.overviewViewMode) ? body.overviewViewMode : undefined;

    // 5. Authenticate
    console.log("[PUT /api/settings] Authenticating...");
    const authResult = await requireAuth(request, supabaseAdmin, getOrCreateUser);

    if (authResult.type === "error") {
      console.warn("[PUT /api/settings] Auth failed");
      return NextResponse.json({ error: authResult.message }, { status: authResult.status });
    }

    if (authResult.type === "degraded") {
      console.warn("[PUT /api/settings] Auth degraded, cannot update");
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }

    // 6. Build update data
    const updateData: Record<string, any> = {};
    if (currency !== undefined) updateData.currency = currency;
    if (claimPerformanceFee !== undefined) updateData.claimPerformanceFee = claimPerformanceFee;
    if (claimTechnicalFee !== undefined) updateData.claimTechnicalFee = claimTechnicalFee;
    if (theme !== undefined) updateData.theme = theme;
    if (pdfIncludeLogo !== undefined) updateData.pdfIncludeLogo = pdfIncludeLogo;
    if (pdfFont !== undefined) updateData.pdfFont = pdfFont;
    if (pdfPageSize !== undefined) updateData.pdfPageSize = pdfPageSize;
    if (pdfPageBreakMode !== undefined) updateData.pdfPageBreakMode = pdfPageBreakMode;
    if (pdfDarkMode !== undefined) updateData.pdfDarkMode = pdfDarkMode;
    if (pdfShowHeaders !== undefined) updateData.pdfShowHeaders = pdfShowHeaders;
    if (pdfShowMetadata !== undefined) updateData.pdfShowMetadata = pdfShowMetadata;
    if (pdfImagesOnly !== undefined) updateData.pdfImagesOnly = pdfImagesOnly;
    if (pdfShowPageNumbers !== undefined) updateData.pdfShowPageNumbers = pdfShowPageNumbers;
    if (pdfMarginSize !== undefined) updateData.pdfMarginSize = pdfMarginSize;
    if (excludeSelfFromMemberCount !== undefined) updateData.excludeSelfFromMemberCount = excludeSelfFromMemberCount;
    // Guard: never persist Tab 1 === Tab 2 — the client swaps on collision,
    // but if only one field arrives in the patch, apply the swap server-side
    // against the existing stored value so the DB can never hold duplicates
    // (which would render two identical primary nav buttons).
    if (customTab1 !== undefined || customTab2 !== undefined) {
      const existing = await prisma.userSettings.findUnique({
        where: { userId: authResult.userId },
        select: { customTab1: true, customTab2: true },
      });
      if (existing) {
        if (customTab1 === undefined && customTab2 !== undefined && existing.customTab1 === customTab2) {
          updateData.customTab1 = existing.customTab2;
        }
        if (customTab2 === undefined && customTab1 !== undefined && existing.customTab2 === customTab1) {
          updateData.customTab2 = existing.customTab1;
        }
      }
    }
    if (customTab1 !== undefined) updateData.customTab1 = customTab1;
    if (customTab2 !== undefined) updateData.customTab2 = customTab2;
    if (overviewViewMode !== undefined) updateData.overviewViewMode = overviewViewMode;

    // 7. Upsert to database
    try {
      console.log("[PUT /api/settings] Upserting settings for userId:", authResult.userId);
      const settings = await prisma.userSettings.upsert({
        where: { userId: authResult.userId },
        update: updateData,
        create: {
          userId: authResult.userId,
          currency: currency ?? DEFAULT_SETTINGS.currency,
          claimPerformanceFee: claimPerformanceFee ?? DEFAULT_SETTINGS.claimPerformanceFee,
          claimTechnicalFee: claimTechnicalFee ?? DEFAULT_SETTINGS.claimTechnicalFee,
          theme: theme ?? DEFAULT_SETTINGS.theme,
          pdfIncludeLogo: pdfIncludeLogo ?? DEFAULT_SETTINGS.pdfIncludeLogo,
          pdfFont: pdfFont ?? DEFAULT_SETTINGS.pdfFont,
          pdfPageSize: pdfPageSize ?? DEFAULT_SETTINGS.pdfPageSize,
          pdfPageBreakMode: pdfPageBreakMode ?? DEFAULT_SETTINGS.pdfPageBreakMode,
          pdfDarkMode: pdfDarkMode ?? DEFAULT_SETTINGS.pdfDarkMode,
          pdfShowHeaders: pdfShowHeaders ?? DEFAULT_SETTINGS.pdfShowHeaders,
          pdfShowMetadata: pdfShowMetadata ?? DEFAULT_SETTINGS.pdfShowMetadata,
          pdfImagesOnly: pdfImagesOnly ?? DEFAULT_SETTINGS.pdfImagesOnly,
          pdfShowPageNumbers: pdfShowPageNumbers ?? DEFAULT_SETTINGS.pdfShowPageNumbers,
          pdfMarginSize: pdfMarginSize ?? DEFAULT_SETTINGS.pdfMarginSize,
          excludeSelfFromMemberCount: excludeSelfFromMemberCount ?? DEFAULT_SETTINGS.excludeSelfFromMemberCount,
          customTab1: customTab1 ?? DEFAULT_SETTINGS.customTab1,
          customTab2: customTab2 ?? DEFAULT_SETTINGS.customTab2,
          overviewViewMode: overviewViewMode ?? DEFAULT_SETTINGS.overviewViewMode,
        },
      });

      console.log("[PUT /api/settings] Settings updated successfully");
      const settingsData: any = settings;
      return NextResponse.json({
        currency: settings.currency,
        claimPerformanceFee: settings.claimPerformanceFee,
        claimTechnicalFee: settings.claimTechnicalFee,
        theme: settings.theme,
        customTab1: settingsData.customTab1 || DEFAULT_SETTINGS.customTab1,
        customTab2: settingsData.customTab2 || DEFAULT_SETTINGS.customTab2,
        overviewViewMode: (settingsData.overviewViewMode === "compact" ? "compact" : "grid"),
        pdfIncludeLogo: settingsData.pdfIncludeLogo ?? DEFAULT_SETTINGS.pdfIncludeLogo,
        pdfFont: settingsData.pdfFont ?? DEFAULT_SETTINGS.pdfFont,
        pdfPageSize: settingsData.pdfPageSize ?? DEFAULT_SETTINGS.pdfPageSize,
        pdfPageBreakMode: settingsData.pdfPageBreakMode ?? DEFAULT_SETTINGS.pdfPageBreakMode,
        pdfDarkMode: settingsData.pdfDarkMode ?? DEFAULT_SETTINGS.pdfDarkMode,
        pdfShowHeaders: settingsData.pdfShowHeaders ?? DEFAULT_SETTINGS.pdfShowHeaders,
        pdfShowMetadata: settingsData.pdfShowMetadata ?? DEFAULT_SETTINGS.pdfShowMetadata,
        pdfImagesOnly: settingsData.pdfImagesOnly ?? DEFAULT_SETTINGS.pdfImagesOnly,
        pdfShowPageNumbers: settingsData.pdfShowPageNumbers ?? DEFAULT_SETTINGS.pdfShowPageNumbers,
        pdfMarginSize: settingsData.pdfMarginSize ?? DEFAULT_SETTINGS.pdfMarginSize,
      });
    } catch (dbErr) {
      const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error("[PUT /api/settings] Database update failed:", errMsg);
      return NextResponse.json({ error: "Failed to save settings" }, { status: 503 });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/settings] FATAL UNHANDLED ERROR:", errMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
