import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminUser } from "@/lib/superadmin-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Capability probe: "is the current user a superadmin?".
 *
 * Deliberately answers 200 with `{ superAdmin: false }` instead of 403 when the
 * user is not an admin. The request itself succeeded — only the capability is
 * absent. Returning 403 made every non-admin (including the shared demo account)
 * produce a red 403 in the browser's network log on every page load, which looks
 * like an error but is the normal, expected case.
 *
 * The other /api/superadmin/* routes keep using requireSuperAdminUser directly
 * and still answer 403 for non-admins.
 */
export async function GET(request: NextRequest) {
  try {
    const result = await requireSuperAdminUser(request);

    if ("error" in result && result.error) {
      // requireSuperAdminUser signals "not allowed" with 401 (missing/invalid
      // session) or 403 (valid session, no admin flag). Only the latter is the
      // expected non-admin answer.
      if (result.error.status === 403) {
        return NextResponse.json({ superAdmin: false });
      }
      return result.error;
    }

    return NextResponse.json({ superAdmin: true, userId: result.user.id });
  } catch (error) {
    console.error("GET /api/superadmin/status error:", error);
    return NextResponse.json({ error: "Failed to check superadmin access" }, { status: 500 });
  }
}