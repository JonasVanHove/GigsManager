import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

// Force dynamic — allows request body access
export const dynamic = "force-dynamic";

/**
 * POST /api/debug/token
 *
 * Debug endpoint to validate a JWT token.
 * Send token in request body: { token: "your-jwt-here" }
 * 
 * ⚠️  This is a debug endpoint only — should be removed or protected in production!
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const token = body.token as string;

    if (!token) {
      return NextResponse.json(
        { error: "Missing token in request body" },
        { status: 400 }
      );
    }

    console.log("[Debug Token] Received token, length:", token.length);
    console.log("[Debug Token] Token starts with:", token.substring(0, 20));

    // Try to validate with Supabase admin
    console.log("[Debug Token] Validating with Supabase admin client...");
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error) {
      console.error("[Debug Token] Validation error:", {
        message: error.message,
        status: (error as any).status,
        code: (error as any).code,
      });
      return NextResponse.json({
        valid: false,
        error: error.message,
        details: error,
        timestamp: new Date().toISOString(),
      });
    }

    if (!data.user) {
      console.error("[Debug Token] No user in validation response");
      return NextResponse.json({
        valid: false,
        error: "No user data in response",
        timestamp: new Date().toISOString(),
      });
    }

    console.log("[Debug Token] Token is valid for user:", data.user.id);
    return NextResponse.json({
      valid: true,
      userId: data.user.id,
      email: data.user.email,
      user: data.user,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[Debug Token] Exception:", errorMsg, err);
    return NextResponse.json(
      {
        valid: false,
        error: errorMsg,
        exception: true,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
