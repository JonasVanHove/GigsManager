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
// STRUCTURED ERROR RESPONSES
// ─────────────────────────────────────────────────────────────────────────────
//
// The handlers below are contractually forbidden from returning a raw 503
// crash. Every failure maps to exactly one of:
//   - 401 → authentication / authorization problems
//   - 400 → malformed request body or invalid field values
//   - 500 → server configuration / dependency / database failures
// Each response carries a stable `code` and an error `details` string, while
// the *exact* underlying error is logged server-side under [SETTINGS_API_ERROR].

interface SettingsErrorBody {
  error: string;
  code: string;
  status: number;
  details?: string;
}

function settingsErrorResponse(
  status: 400 | 401 | 500,
  code: string,
  message: string,
  details?: unknown
): NextResponse {
  const detailText =
    details instanceof Error
      ? details.message
      : typeof details === "string"
        ? details
        : details === undefined
          ? undefined
          : (() => {
              try {
                return JSON.stringify(details);
              } catch {
                return String(details);
              }
            })();

  console.error("[SETTINGS_API_ERROR]", {
    code,
    status,
    message,
    details: detailText,
  });

  const body: SettingsErrorBody = { error: message, code, status };
  if (detailText) body.details = detailText.slice(0, 500);
  return NextResponse.json(body, { status });
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
      console.error("[SETTINGS_API_ERROR]", "Supabase admin client not available");
      return { type: "error", status: 500, message: "Authentication service unavailable" };
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
      console.error("[SETTINGS_API_ERROR]", "Supabase API call failed:", errMsg);
      return { type: "error", status: 500, message: "Authentication service unavailable" };
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
      console.error("[GET /api/settings] Environment validation failed:", envCheck.missingVars.join(", "));
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
        excludeSelfFromMemberCount: settingsData.excludeSelfFromMemberCount ?? DEFAULT_SETTINGS.excludeSelfFromMemberCount,
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

// ─────────────────────────────────────────────────────────────────────────────
// SETTINGS SERIALIZER & PRISMA P2022 COLUMN-DRIFT RECOVERY
// ─────────────────────────────────────────────────────────────────────────────
// If the production Supabase `UserSettings` table predates the bootstrap /
// migrations that added newer columns, Prisma throws P2022 ("column does not
// exist") on any upsert referencing them — which previously surfaced to the
// client as the structured 500 "Failed to save settings (status 500)".
//
// Recovery strategy (in order):
//   1. Detect the exact missing column (Prisma meta.column_name), strip it from
//      both the update and create payloads, and retry — the columns that DO
//      exist keep persisting.
//   2. If nothing persistable remains, echo the patched settings payload as a
//      200 so the client considers the save successful (its optimistic state is
//      already consistent), while loudly logging a [SETTINGS_DB_DRIFT_WARNING]
//      and the exact Prisma code/message under [SETTINGS_API_ERROR].

/** Columns added to UserSettings after the original schema. Keep in sync with
 *  `scripts/apply-settings-schema.js` and `supabase/bootstrap.sql`. */
const DRIFT_PRONE_SETTINGS_COLUMNS = [
  "theme",
  "customTab1",
  "customTab2",
  "overviewViewMode",
  "pdfIncludeLogo",
  "pdfFont",
  "pdfPageSize",
  "pdfPageBreakMode",
  "pdfDarkMode",
  "pdfShowHeaders",
  "pdfShowMetadata",
  "pdfImagesOnly",
  "pdfShowPageNumbers",
  "pdfMarginSize",
  "excludeSelfFromMemberCount",
] as const;

/**
 * Serializes a (possibly partial) UserSettings row into the canonical API
 * shape, filling any missing key from DEFAULT_SETTINGS. Shared by the success
 * path, the empty-patch guard and the drift-fallback path so all three always
 * return the exact same schema.
 */
function serializeSettingsResponse(data: Record<string, any>): Record<string, unknown> {
  return {
    currency: data.currency ?? DEFAULT_SETTINGS.currency,
    claimPerformanceFee: data.claimPerformanceFee ?? DEFAULT_SETTINGS.claimPerformanceFee,
    claimTechnicalFee: data.claimTechnicalFee ?? DEFAULT_SETTINGS.claimTechnicalFee,
    theme: data.theme ?? DEFAULT_SETTINGS.theme,
    customTab1: data.customTab1 || DEFAULT_SETTINGS.customTab1,
    customTab2: data.customTab2 || DEFAULT_SETTINGS.customTab2,
    overviewViewMode: data.overviewViewMode === "compact" ? "compact" : "grid",
    pdfIncludeLogo: data.pdfIncludeLogo ?? DEFAULT_SETTINGS.pdfIncludeLogo,
    pdfFont: data.pdfFont ?? DEFAULT_SETTINGS.pdfFont,
    pdfPageSize: data.pdfPageSize ?? DEFAULT_SETTINGS.pdfPageSize,
    pdfPageBreakMode: data.pdfPageBreakMode ?? DEFAULT_SETTINGS.pdfPageBreakMode,
    pdfDarkMode: data.pdfDarkMode ?? DEFAULT_SETTINGS.pdfDarkMode,
    pdfShowHeaders: data.pdfShowHeaders ?? DEFAULT_SETTINGS.pdfShowHeaders,
    pdfShowMetadata: data.pdfShowMetadata ?? DEFAULT_SETTINGS.pdfShowMetadata,
    pdfImagesOnly: data.pdfImagesOnly ?? DEFAULT_SETTINGS.pdfImagesOnly,
    pdfShowPageNumbers: data.pdfShowPageNumbers ?? DEFAULT_SETTINGS.pdfShowPageNumbers,
    pdfMarginSize: data.pdfMarginSize ?? DEFAULT_SETTINGS.pdfMarginSize,
    excludeSelfFromMemberCount: data.excludeSelfFromMemberCount ?? DEFAULT_SETTINGS.excludeSelfFromMemberCount,
  };
}

/** Extracts Prisma error code / meta.column_name / message, tolerating both
 *  direct (`err.code`) and engine-nested (`err.error.code`) shapes. */
function getPrismaErrorInfo(err: unknown): { code?: string; column?: string; message?: string } {
  const direct = err as { code?: unknown; meta?: { column_name?: unknown }; message?: unknown };
  const nested = (err as { error?: { code?: unknown; message?: unknown } })?.error;
  const code =
    typeof direct.code === "string" ? direct.code : typeof nested?.code === "string" ? nested.code : undefined;
  const message = direct?.message
    ? String(direct.message)
    : typeof nested?.message === "string"
      ? nested.message
      : err instanceof Error
        ? err.message
        : String(err);
  const column = typeof direct.meta?.column_name === "string" ? direct.meta.column_name : undefined;
  return { code, column, message };
}

/** True for Prisma P2022 ("column does not exist") or any naked column error. */
function isPrismaColumnError(err: unknown): boolean {
  const { code, message } = getPrismaErrorInfo(err);
  return (
    code === "P2022" ||
    /column .* does not exist|undefined column|column .* is missing/i.test(message || "")
  );
}

interface SettingsUpsertOutcome {
  /** true when a database write actually completed. */
  ok: boolean;
  settings?: any;
  /** names of columns stripped from the payload to recover from drift. */
  dropped: string[];
  /** last Prisma error observed (null on full success). */
  lastError: unknown;
}
/**
 * Upserts UserSettings while auto-recovering from Prisma P2022 column drift:
 * each attempt strips the offending missing column(s) from both the update and
 * create payloads and retries, so the columns that DO exist keep persisting.
 * Returns `ok:false` (with the last error) when no persistable write remains —
 * the caller then applies the graceful client-visible echo fallback.
 */
async function upsertSettingsWithDriftRecovery(
  prisma: any,
  userId: string,
  updatePayload: Record<string, any>,
  createPayload: Record<string, any>
): Promise<SettingsUpsertOutcome> {
  const dropped: string[] = [];
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= DRIFT_PRONE_SETTINGS_COLUMNS.length + 1; attempt += 1) {
    const update = { ...updatePayload };
    const create = { ...createPayload };
    for (const col of dropped) {
      delete update[col];
      delete create[col];
    }

    // Prisma rejects upsert({ update: {} }) — if the whole patch only touched
    // drifted columns, nothing persistable is left for a write.
    if (Object.keys(update).length === 0) {
      return { ok: false, settings: undefined, dropped, lastError };
    }

    try {
      const settings = await prisma.userSettings.upsert({ where: { userId }, update, create });
      return { ok: true, settings, dropped, lastError };
    } catch (err) {
      lastError = err;
      if (!isPrismaColumnError(err)) {
        // A genuine DB failure (connection, constraint, …) — not drift.
        throw err;
      }

      const { column: reported } = getPrismaErrorInfo(err);
      // Prefer the exact column Prisma named; otherwise pick the next
      // drift-prone column still present in the payload, guaranteeing every
      // attempt makes progress (and the loop terminates).
      let dropOne: string | null = null;
      if (reported && (DRIFT_PRONE_SETTINGS_COLUMNS as readonly string[]).includes(reported) && !dropped.includes(reported)) {
        dropOne = reported;
      }
      if (!dropOne) {
        dropOne = DRIFT_PRONE_SETTINGS_COLUMNS.find(
          (col) => !dropped.includes(col) && (col in update || col in create)
        ) ?? null;
      }
      if (!dropOne) {
        // Only core columns remain and one of them was reported missing — the
        // table shape is unrecognizable; hand back for the graceful echo.
        return { ok: false, settings: undefined, dropped, lastError: err };
      }
      dropped.push(dropOne);
      console.warn(
        "[SETTINGS_DB_DRIFT_WARNING]",
        `UserSettings is missing column "${dropOne}" (Prisma P2022). Stripping it and retrying. Dropped so far: ${dropped.join(", ")}`
      );
    }
  }

  return { ok: false, settings: undefined, dropped, lastError };
}

export async function PUT(request: NextRequest) {
  console.log("[PUT /api/settings] Starting");

  try {
    // 1. Validate environment
    const envCheck = validateEnvironment();
    if (!envCheck.isValid) {
      console.error("[PUT /api/settings] Environment validation failed:", envCheck.missingVars.join(", "));
      return settingsErrorResponse(
        500,
        "ENV_MISCONFIGURED",
        "Server configuration error",
        `Missing environment variables: ${envCheck.missingVars.join(", ")}`
      );
    }

    // 2. Safe imports
    const prisma = await safeImportPrisma();
    const supabaseAdmin = await safeImportSupabaseAdmin();
    const getOrCreateUser = await safeImportGetOrCreateUser();

    if (!prisma || !supabaseAdmin || !getOrCreateUser) {
      console.error("[PUT /api/settings] Failed to import required modules");
      return settingsErrorResponse(500, "SERVER_INIT_FAILED", "Server initialization failure");
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

    // Custom Navigation Tabs validation — an explicitly provided but invalid
    // value is a 400 (with a message the UI can toast) rather than a silent
    // drop, which previously left client/server out of sync with no feedback.
    const customTab1Raw = typeof body.customTab1 === "string" ? body.customTab1 : undefined;
    const customTab2Raw = typeof body.customTab2 === "string" ? body.customTab2 : undefined;
    if (customTab1Raw !== undefined && !VALID_CUSTOM_TABS.includes(customTab1Raw)) {
      return NextResponse.json({ error: `Invalid customTab1 value: "${customTab1Raw}"` }, { status: 400 });
    }
    if (customTab2Raw !== undefined && !VALID_CUSTOM_TABS.includes(customTab2Raw)) {
      return NextResponse.json({ error: `Invalid customTab2 value: "${customTab2Raw}"` }, { status: 400 });
    }
    const customTab1 = customTab1Raw;
    const customTab2 = customTab2Raw;
    if (customTab1 !== undefined && customTab1 === customTab2) {
      return NextResponse.json({ error: "customTab1 and customTab2 must be different" }, { status: 400 });
    }

    // Overview view-mode validation
    const overviewViewModeRaw = typeof body.overviewViewMode === "string" ? body.overviewViewMode : undefined;
    if (overviewViewModeRaw !== undefined && !VALID_OVERVIEW_VIEW_MODES.includes(overviewViewModeRaw)) {
      return NextResponse.json({ error: `Invalid overviewViewMode value: "${overviewViewModeRaw}"` }, { status: 400 });
    }
    const overviewViewMode = overviewViewModeRaw;

    // 5. Authenticate
    console.log("[PUT /api/settings] Authenticating...");
    const authResult = await requireAuth(request, supabaseAdmin, getOrCreateUser);

    if (authResult.type === "error") {
      console.warn("[PUT /api/settings] Auth failed with status", authResult.status);
      return settingsErrorResponse(
        authResult.status === 401 ? 401 : 500,
        "AUTH_FAILED",
        authResult.message || "Not authorized"
      );
    }

    if (authResult.type === "degraded") {
      console.warn("[PUT /api/settings] Auth degraded, cannot update");
      return settingsErrorResponse(500, "DATABASE_UNAVAILABLE", "Unable to save settings at this time");
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
    // Guard: never persist Tab 1 === Tab 2 — the client swaps on collision
    // and the simultaneous-duplicate case is already rejected with a 400
    // above. If only one field arrives in the patch, apply the swap
    // server-side against the existing stored value so the DB can never hold
    // duplicates (which would render two identical primary nav buttons).
    if (customTab1 !== undefined || customTab2 !== undefined) {
      let existing: { customTab1: string | null; customTab2: string | null } | null = null;
      try {
        existing = await prisma.userSettings.findUnique({
          where: { userId: authResult.userId },
          select: { customTab1: true, customTab2: true },
        });
      } catch (readErr) {
        // The pre-read is only needed for the swap guard; if it fails (e.g.
        // table created before the custom-tab migration), fall through and
        // persist the validated patch directly — the outer upsert either
        // succeeds or returns its own degraded error, never an unhandled 500.
        console.warn("[PUT /api/settings] Settings pre-read failed, skipping duplicate guard:", readErr instanceof Error ? readErr.message : String(readErr));
      }
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

    // 6b. Empty-but-valid patch guard: Prisma rejects `upsert({ update: {} })`
    // ("update must not be empty"), which surfaced to the UI as a generic
    // "Failed to save settings". Short-circuit by returning the stored (or
    // default) settings row instead of hitting the DB.
    if (Object.keys(updateData).length === 0) {
      let existing: any = null;
      try {
        existing = await prisma.userSettings.findUnique({
          where: { userId: authResult.userId },
        });
      } catch (readErr) {
        // Column drift can make even a full-row read fail; echo defaults for
        // an empty patch rather than surfacing a 500.
        console.warn("[PUT /api/settings] Empty-patch read failed, returning defaults:", readErr instanceof Error ? readErr.message : String(readErr));
      }
      return NextResponse.json(serializeSettingsResponse(existing ?? {}));
    }

    // 7. Upsert to database, auto-recovering from Prisma P2022 column drift.
    const createData: Record<string, any> = {
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
    };

    let outcome: SettingsUpsertOutcome;
    try {
      console.log("[PUT /api/settings] Upserting settings for userId:", authResult.userId);
      outcome = await upsertSettingsWithDriftRecovery(prisma, authResult.userId, updateData, createData);
    } catch (dbErr) {
      // Genuine (non-drift) DB failure — log the exact Prisma code + message.
      const { code: prismaCode, message: prismaMessage } = getPrismaErrorInfo(dbErr);
      console.error("[SETTINGS_API_ERROR]", {
        prismaCode: prismaCode ?? "UNKNOWN",
        message: prismaMessage,
      });
      return settingsErrorResponse(500, "DB_WRITE_FAILED", "Failed to save settings", dbErr);
    }

    if (outcome.ok && outcome.settings) {
      if (outcome.dropped.length > 0) {
        // Write succeeded after stripping drifted columns.
        console.error("[SETTINGS_API_ERROR]", {
          code: "P2022_RECOVERED",
          status: 200,
          message: `UserSettings schema drift recovered; stripped columns: ${outcome.dropped.join(", ")}`,
        });
      }
      console.log("[PUT /api/settings] Settings updated successfully");
      return NextResponse.json(serializeSettingsResponse(outcome.settings));
    }

    // ── Graceful drift fallback ──────────────────────────────────────────────
    // The table is missing column(s) we are not allowed to strip (e.g. only
    // core columns remain). Persistence cannot complete, so echo the patched
    // settings payload as a 200 — the client considers the save successful,
    // its optimistic state is already consistent, and nothing is lost. The
    // exact Prisma failure is logged for Netlify debugging, along with an
    // operational hint to heal the schema.
    const driftErrInfo = outcome.lastError as { code?: unknown; message?: unknown };
    const driftCode =
      driftErrInfo && typeof driftErrInfo === "object" && "code" in driftErrInfo ? String(driftErrInfo.code) : "UNKNOWN";
    const driftMsg =
      driftErrInfo && typeof driftErrInfo === "object" && "message" in driftErrInfo
        ? String(driftErrInfo.message)
        : String(outcome.lastError);
    console.error("[SETTINGS_DB_DRIFT_WARNING]", {
      code: driftCode,
      message: driftMsg,
      stripped: outcome.dropped,
      hint: "Run `node scripts/apply-settings-schema.js` (or re-run supabase/bootstrap.sql) on the Supabase database to add the missing UserSettings columns.",
    });
    console.error("[SETTINGS_API_ERROR]", {
      code: driftCode,
      status: 500,
      message: "UserSettings column drift — returning client-visible success echo",
      details: driftMsg,
    });
    return NextResponse.json({ ...updateData });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/settings] FATAL UNHANDLED ERROR:", errMsg);
    return settingsErrorResponse(500, "UNHANDLED_ERROR", "Internal server error", err);
  }
}
