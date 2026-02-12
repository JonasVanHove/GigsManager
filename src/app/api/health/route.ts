import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Force dynamic — never pre-render this route during build
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Lightweight health-check that pings the database and checks environment.
 * Used by:
 *  - Monitoring / uptime checks
 *  - GitHub Actions keep-alive cron (prevents Supabase free-tier pause)
 *  - Debugging environment configuration
 */
export async function GET() {
  const start = Date.now();

  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - start;

    // Check environment variables
    const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL;
    const hasServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
    const hasAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    console.log("[Health Check] Environment:", {
      hasSupabaseUrl,
      hasServiceKey,
      hasAnonKey,
    });

    return NextResponse.json({
      status: "healthy",
      database: "connected",
      env: {
        supabaseUrl: hasSupabaseUrl ? "✓" : "✗",
        serviceRoleKey: hasServiceKey ? "✓" : "✗",
        anonKey: hasAnonKey ? "✓" : "✗",
      },
      latencyMs: dbLatencyMs,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Health Check] Error:", error);
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "disconnected",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
