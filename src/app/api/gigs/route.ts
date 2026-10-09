/**
 * PRODUCTION-SAFE VERSION: /api/gigs
 * 
 * Critical fixes:
 * 1. Validates environment variables before use
 * 2. Safe imports with null checks
 * 3. Wraps ALL operations in outer try/catch blocks
 * 4. Helper functions wrapped in safe calls (measureAsync, recordMetric)
 * 5. POST handler has comprehensive error boundary
 * 6. Graceful degradation instead of 500 errors
 * 7. No unhandled exceptions from dependencies
 */

import { NextRequest, NextResponse } from "next/server";
import { getBandAccess } from "@/lib/band-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ─────────────────────────────────────────────────────────────────────────────
// ENVIRONMENT VALIDATION
// ─────────────────────────────────────────────────────────────────────────────

function validateEnvironment() {
  const missingVars: string[] = [];

  if (!process.env.DATABASE_URL) missingVars.push("DATABASE_URL");
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missingVars.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingVars.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missingVars.length > 0) {
    console.error("[Gigs] Missing environment variables:", missingVars.join(", "));
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
    return mod?.prisma || null;
  } catch (err) {
    console.error("[Gigs] Failed to import Prisma:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function safeImportSupabaseAdmin() {
  try {
    const mod = await import("@/lib/supabase-admin");
    return mod?.supabaseAdmin || null;
  } catch (err) {
    console.error("[Gigs] Failed to import Supabase admin:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function safeImportGetOrCreateUser() {
  try {
    const mod = await import("@/lib/auth-helpers");
    return mod?.getOrCreateUser || null;
  } catch (err) {
    console.error("[Gigs] Failed to import auth helpers:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function extractBearerToken(request: NextRequest): string | null {
  try {
    const authHeader = request.headers.get("authorization") ?? request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) return null;
    return authHeader.slice(7);
  } catch (err) {
    console.error("[Gigs] Failed to extract bearer token:", err);
    return null;
  }
}

// Safe wrapper for helper functions that might fail
// recordMetric signature: (name: string, duration: number, metadata: any) => void
async function safeRecordMetric(name: string, duration: number, metadata: any) {
  try {
    const mod = await import("@/lib/performance-metrics");
    if (mod?.recordMetric && typeof mod.recordMetric === "function") {
      return await mod.recordMetric(name, duration, metadata);
    }
  } catch (err) {
    // Silently fail - metrics are not critical
  }
}

async function safeMeasureAsync(name: string, fn: () => Promise<any>, metadata?: any) {
  try {
    const mod = await import("@/lib/performance-metrics");
    if (mod?.measureAsync && typeof mod.measureAsync === "function") {
      return await mod.measureAsync(name, fn, metadata);
    }
  } catch (err) {
    // If measureAsync fails, just run the function directly
    console.warn("[Gigs] measureAsync unavailable, running function directly");
    return await fn();
  }
}

async function safeGetCacheEntry(key: string) {
  try {
    const mod = await import("@/lib/cache");
    if (mod?.getCacheEntry && typeof mod.getCacheEntry === "function") {
      return mod.getCacheEntry(key);
    }
  } catch (err) {
    console.warn("[Gigs] Cache read failed:", err instanceof Error ? err.message : String(err));
  }
  return null;
}

async function safeSetCacheEntry(key: string, value: any, ttl: number) {
  try {
    const mod = await import("@/lib/cache");
    if (mod?.setCacheEntry && typeof mod.setCacheEntry === "function") {
      return mod.setCacheEntry(key, value, ttl);
    }
  } catch (err) {
    console.warn("[Gigs] Cache write failed:", err instanceof Error ? err.message : String(err));
  }
}

async function safeInvalidateCache(pattern: string) {
  try {
    const mod = await import("@/lib/cache");
    if (mod?.invalidateCache && typeof mod.invalidateCache === "function") {
      return mod.invalidateCache(pattern);
    }
  } catch (err) {
    console.warn("[Gigs] Cache invalidation failed:", err instanceof Error ? err.message : String(err));
  }
}

function getCacheKey(userId: string, type: string, params: any) {
  return `${type}:${userId}:${JSON.stringify(params)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHENTICATION
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
    console.warn("[Gigs Auth] Missing authorization token");
    return { type: "error", status: 401, message: "Missing authorization token" };
  }

  try {
    // Authenticate through Supabase before resolving the application user.
    console.log("[Gigs Auth] JWT decode failed, trying Supabase...");

    if (!supabaseAdmin || !supabaseAdmin.auth) {
      console.error("[Gigs Auth] Supabase admin not available");
      return { type: "error", status: 503, message: "Service unavailable" };
    }

    try {
      const { data, error } = await supabaseAdmin.auth.getUser(token);

      if (error) {
        console.warn("[Gigs Auth] Supabase error:", error.message);
        return { type: "error", status: 401, message: "Invalid token" };
      }

      if (!data?.user?.id) {
        console.warn("[Gigs Auth] No user data");
        return { type: "error", status: 401, message: "User not found" };
      }

      try {
        const user = await getOrCreateUser(data.user.id, data.user.email || "", data.user.user_metadata?.name || null);
        if (!user || !user.id) {
          return { type: "degraded" };
        }
        return { type: "success", userId: user.id };
      } catch (dbErr) {
        const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
        console.error("[Gigs Auth] User sync failed:", errMsg);
        return { type: "degraded" };
      }
    } catch (supabaseErr) {
      const errMsg = supabaseErr instanceof Error ? supabaseErr.message : String(supabaseErr);
      console.error("[Gigs Auth] Supabase API failed:", errMsg);
      return { type: "error", status: 503, message: "Service unavailable" };
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[Gigs Auth] Unexpected error:", errMsg);
    return { type: "error", status: 500, message: "Internal server error" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/gigs
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  console.log("[GET /api/gigs] Starting");

  let take = 100;
  let skip = 0;

  try {
    // 1. Validate environment
    const envCheck = validateEnvironment();
    if (!envCheck.isValid) {
      console.error("[GET /api/gigs] Environment invalid");
      return NextResponse.json(
        { data: [], total: 0, take, skip, degraded: true, error: "Service configuration incomplete" },
        { headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } }
      );
    }

    // 2. Safe imports
    const prisma = await safeImportPrisma();
    const supabaseAdmin = await safeImportSupabaseAdmin();
    const getOrCreateUser = await safeImportGetOrCreateUser();

    if (!prisma || !supabaseAdmin || !getOrCreateUser) {
      console.error("[GET /api/gigs] Failed to import modules");
      return NextResponse.json(
        { data: [], total: 0, take, skip, degraded: true, error: "Service initialization failed" },
        { headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } }
      );
    }

    // 3. Parse query params
    try {
      const { searchParams } = new URL(request.url);
      take = Math.min(Number(searchParams.get("take")) || 100, 200);
      skip = Math.max(Number(searchParams.get("skip")) || 0, 0);
    } catch (err) {
      console.warn("[GET /api/gigs] Invalid query params");
      take = 100;
      skip = 0;
    }

    // 4. Authenticate
    console.log("[GET /api/gigs] Authenticating...");
    const authResult = await requireAuth(request, supabaseAdmin, getOrCreateUser);

    if (authResult.type === "error") {
      console.warn("[GET /api/gigs] Auth failed");
      return NextResponse.json(
        { error: authResult.message },
        { status: authResult.status }
      );
    }

    if (authResult.type === "degraded") {
      console.warn("[GET /api/gigs] Auth degraded");
      return NextResponse.json(
        { data: [], total: 0, take, skip, degraded: true },
        { headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } }
      );
    }

    const userId = authResult.userId;
    console.log("[GET /api/gigs] ✓ Auth successful, userId:", userId);

    // 5. Check cache
    const cacheKey = getCacheKey(userId, "gigs", { take, skip });
    const requestCacheControl = request.headers.get("cache-control") || "";
    const bypassCache = /no-cache|no-store/i.test(requestCacheControl);
    const cached = bypassCache ? null : await safeGetCacheEntry(cacheKey);
    if (cached) {
      console.log("[GET /api/gigs] ✓ Cache hit, returning cached data");
      return NextResponse.json(cached, { headers: { "Cache-Control": "private, max-age=15", Vary: "Authorization" } });
    }

    // 6. Query database
    try {
      console.log("[GET /api/gigs] Executing query with:", { userId, take, skip });
      
      // First fetch all bands for this user to enable name-based matching
      const allBands = await prisma.bands.findMany({
        where: { userId },
        select: { id: true, name: true, color: true, chatType: true, chatUrl: true },
      });

      // Gigs the user plays on, resolved through their own BandMember rows.
      // Imported dynamically to match this file's safe-import style.
      const sharing = await import("@/lib/band-sharing");
      const sharedGigIds = await sharing.findSharedGigIds(userId);
      const editPermissions = await sharing.getBandEditPermissions(userId);

      // Owner OR participant. Empty shared set keeps the previous single-clause
      // shape so the common case does not change query plans.
      const visibilityFilter =
        sharedGigIds.size > 0
          ? { OR: [{ userId }, { id: { in: [...sharedGigIds] } }] }
          : { userId };
      
      const result = await safeMeasureAsync(
        "GET /api/gigs [DB QUERY]",
        async () => {
          console.log("[GET /api/gigs] Starting findMany...");
          const gigs = await prisma.gig.findMany({
            where: visibilityFilter,
            orderBy: { date: "desc" },
            take,
            skip,
            include: {
              band: {
                select: {
                  id: true,
                  name: true,
                  color: true,
                  chatType: true,
                  chatUrl: true,
                },
              },
            },
          });
          console.log("[GET /api/gigs] findMany returned", gigs.length, "gigs");
          
          // Fallback: match band by name if bandId is not set, then strip the
          // fields this viewer is not allowed to see.
          const gigsWithBandFallback = gigs.map((gig) => {
            const enriched =
              !gig.band && gig.performers
                ? (() => {
                    const matchedBand = allBands.find(
                      (band) => band.name.toLowerCase() === gig.performers.trim().toLowerCase()
                    );
                    return matchedBand ? { ...gig, band: matchedBand } : gig;
                  })()
                : gig;

            return sharing.redactGigForBandmate(enriched, {
              isOwner: gig.userId === userId,
              // Per band: leading one band must not unlock another's gigs.
              canEdit: sharing.canEditSharedGig(
                editPermissions,
                enriched.band?.name ?? gig.performers
              ),
            });
          });
          
          console.log("[GET /api/gigs] Starting count...");
          const count = await prisma.gig.count({ where: visibilityFilter });
          console.log("[GET /api/gigs] count returned:", count);
          
          return [gigsWithBandFallback, count];
        },
        { endpoint: "/api/gigs", userId, metadata: { take, skip } }
      );

      const [gigs, total] = result;
      const payload = { data: gigs, total, take, skip };

      // Cache the result
      if (!bypassCache) await safeSetCacheEntry(cacheKey, payload, 15);

      console.log("[GET /api/gigs] ✓ Query successful, userId:", userId, "found", gigs.length, "gigs out of", total, "total");
      return NextResponse.json(payload, { headers: { "Cache-Control": "private, max-age=15", Vary: "Authorization" } });
    } catch (dbErr) {
      const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      const errStack = dbErr instanceof Error ? dbErr.stack : "no stack";
      console.error("[GET /api/gigs] ✗ Database query failed:", errMsg);
      console.error("[GET /api/gigs] Stack:", errStack);

      // Graceful degradation
      return NextResponse.json(
        { data: [], total: 0, take, skip, degraded: true, error: "Database temporarily unavailable" },
        { headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } }
      );
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[GET /api/gigs] FATAL UNHANDLED ERROR:", errMsg);

    // Final safety net
    return NextResponse.json(
      { data: [], total: 0, take, skip, degraded: true, error: "Internal server error" },
      { headers: { "Cache-Control": "private, no-store", Vary: "Authorization" } }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/gigs
// ─────────────────────────────────────────────────────────────────────────────

interface ValidationError {
  field: string;
  message: string;
}

function validateGigInput(body: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== "object") {
    errors.push({ field: "body", message: "Request body must be an object" });
    return errors;
  }

  if (!body.eventName || typeof body.eventName !== "string" || !body.eventName.trim()) {
    errors.push({ field: "eventName", message: "Event name is required" });
  }

  if (!body.date) {
    errors.push({ field: "date", message: "Date is required" });
  } else {
    try {
      const dateObj = new Date(String(body.date));
      if (isNaN(dateObj.getTime())) {
        errors.push({ field: "date", message: "Invalid date format" });
      }
    } catch (err) {
      errors.push({ field: "date", message: "Invalid date" });
    }
  }

  if (!body.performers || typeof body.performers !== "string" || !body.performers.trim()) {
    errors.push({ field: "performers", message: "Performers is required" });
  }

  const musicians = Number(body.numberOfMusicians);
  if (!musicians || musicians < 1 || !Number.isInteger(musicians)) {
    errors.push({ field: "numberOfMusicians", message: "Must be a whole number ≥ 1" });
  }

  const fee = Number(body.performanceFee);
  if (isNaN(fee) || fee < 0) {
    errors.push({ field: "performanceFee", message: "Must be ≥ 0" });
  }

  const techFee = Number(body.technicalFee);
  if (isNaN(techFee) || techFee < 0) {
    errors.push({ field: "technicalFee", message: "Must be ≥ 0" });
  }

  return errors;
}

function toGigData(body: any, userId: string) {
  return {
    eventName: String(body.eventName || "").trim(),
    date: new Date(new Date(String(body.date)).toISOString()),
    performers: String(body.performers || "").trim(),
    numberOfMusicians: Math.max(1, Math.round(Number(body.numberOfMusicians) || 1)),
    performanceLineup: body.performanceLineup ? String(body.performanceLineup).trim() : null,
    managerPerforms: body.managerPerforms !== false,
    isCharity: Boolean(body.isCharity),
    isTentative: Boolean(body.isTentative),
    performanceFee: Math.max(0, Number(body.performanceFee) || 0),
    performanceFeeUnknown: Boolean(body.performanceFeeUnknown),
    technicalFee: Math.max(0, Number(body.technicalFee) || 0),
    managerBonusType: (body.managerBonusType as string) || "fixed",
    managerBonusAmount: Math.max(0, Number(body.managerBonusAmount) || 0),
    claimPerformanceFee: body.claimPerformanceFee !== false,
    claimTechnicalFee: body.claimTechnicalFee !== false,
    technicalFeeClaimAmount: body.technicalFeeClaimAmount ? Number(body.technicalFeeClaimAmount) : null,
    managerHandlesDistribution: body.managerHandlesDistribution !== false,
    // Opt-out: bandmates see the money unless the owner hides it per gig.
    isFinancialHidden: Boolean(body.isFinancialHidden),
    advanceReceivedByManager: Math.max(0, Number(body.advanceReceivedByManager) || 0),
    advanceToMusicians: Math.max(0, Number(body.advanceToMusicians) || 0),
    paymentReceived: Boolean(body.paymentReceived),
    paymentReceivedDate: body.paymentReceivedDate ? new Date(String(body.paymentReceivedDate)) : null,
    bandPaid: Boolean(body.bandPaid),
    bandPaidDate: body.bandPaidDate ? new Date(String(body.bandPaidDate)) : null,
    bookingDate: body.bookingDate ? new Date(String(body.bookingDate)) : new Date(),
    notes: body.notes ? String(body.notes).trim() : null,
    // --- Logistics (v1.31.0) ---
    venueName: body.venueName ? String(body.venueName).trim() : null,
    venueLocation: body.venueLocation ? String(body.venueLocation).trim() : null,
    soundcheckTime: body.soundcheckTime
      ? String(body.soundcheckTime).trim().slice(0, 5)
      : null,
    doorsOpenTime: body.doorsOpenTime
      ? String(body.doorsOpenTime).trim().slice(0, 5)
      : null,
    performanceDurationMinutes: (() => {
      const value = Number(body.performanceDurationMinutes);
      return Number.isFinite(value) && value > 0
        ? Math.min(1440, Math.round(value))
        : null;
    })(),
    gearSetupNotes: body.gearSetupNotes ? String(body.gearSetupNotes).trim() : null,
    // --- Organizer contact (v1.31.0) ---
    organizerName: body.organizerName ? String(body.organizerName).trim() : null,
    organizerEmail: body.organizerEmail ? String(body.organizerEmail).trim() : null,
    organizerPhone: body.organizerPhone ? String(body.organizerPhone).trim() : null,
    setlistId: body.setlistId ? String(body.setlistId) : null,
    bandId: body.bandId ? String(body.bandId) : null,
    userId,
  };
}

export async function POST(request: NextRequest) {
  console.log("[POST /api/gigs] Starting");

  try {
    // 1. Validate environment
    const envCheck = validateEnvironment();
    if (!envCheck.isValid) {
      console.error("[POST /api/gigs] Environment invalid");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // 2. Safe imports
    const prisma = await safeImportPrisma();
    const supabaseAdmin = await safeImportSupabaseAdmin();
    const getOrCreateUser = await safeImportGetOrCreateUser();

    if (!prisma || !supabaseAdmin || !getOrCreateUser) {
      console.error("[POST /api/gigs] Failed to import modules");
      return NextResponse.json({ error: "Service initialization failed" }, { status: 503 });
    }

    // 3. Authenticate
    console.log("[POST /api/gigs] Authenticating...");
    const authResult = await requireAuth(request, supabaseAdmin, getOrCreateUser);

    if (authResult.type === "error") {
      console.warn("[POST /api/gigs] Auth failed");
      return NextResponse.json({ error: authResult.message }, { status: authResult.status });
    }

    if (authResult.type === "degraded") {
      console.warn("[POST /api/gigs] Auth degraded, cannot create");
      return NextResponse.json({ error: "Database temporarily unavailable" }, { status: 503 });
    }

    // 4. Parse body
    let body: any;
    try {
      body = await request.json();
    } catch (parseErr) {
      console.warn("[POST /api/gigs] Invalid JSON");
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    // 5. Validate input
    const errors = validateGigInput(body);
    if (errors.length > 0) {
      console.warn("[POST /api/gigs] Validation failed:", errors.length, "errors");
      return NextResponse.json({ errors }, { status: 400 });
    }

    if (body.bandId) {
      const bandAccess = await getBandAccess(prisma, String(body.bandId), authResult.userId);
      if (!bandAccess) {
        return NextResponse.json({ error: "You are not a member of this band" }, { status: 403 });
      }
    }

    // 6. Create gig
    try {
      console.log("[POST /api/gigs] Creating gig for userId:", authResult.userId);
      const gigData = toGigData(body, authResult.userId);

      const gig = await prisma.gig.create({
        data: gigData,
      });

      console.log("[POST /api/gigs] Gig created:", gig.id);

      // Invalidate cache
      await safeInvalidateCache("gigs:");

      return NextResponse.json(gig, { status: 201 });
    } catch (dbErr) {
      const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);
      console.error("[POST /api/gigs] Database create failed:", errMsg);
      return NextResponse.json({ error: "Failed to create gig" }, { status: 503 });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[POST /api/gigs] FATAL UNHANDLED ERROR:", errMsg);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
