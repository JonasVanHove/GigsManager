import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateUser } from "@/lib/auth-helpers";

async function requireAuth(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await getOrCreateUser(
    data.user.id,
    data.user.email || "",
    data.user.user_metadata?.name
  );

  return { user };
}

// GET /api/notifications - List notifications
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const status = searchParams.get("status"); // "unread", "read", "dismissed"

    // TODO: Fetch from database when Notification model is created
    // For now, return empty array with proper structure

    // Sample notifications for demo purposes
    const mockNotifications = [];

    return NextResponse.json({
      notifications: mockNotifications,
      count: mockNotifications.length,
      message: "Notification model not yet created in database",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[GET /api/notifications] Error:", msg);
    return NextResponse.json(
      { error: "Failed to fetch notifications", details: msg },
      { status: 500 }
    );
  }
}

// PATCH /api/notifications/:id - Mark as read or dismiss
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const { searchParams } = new URL(request.url);
    const notifId = searchParams.get("id");

    if (!notifId) {
      return NextResponse.json(
        { error: "Notification ID required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { action } = body; // "read" or "dismiss"

    if (!action || !["read", "dismiss"].includes(action)) {
      return NextResponse.json(
        { error: 'Action must be "read" or "dismiss"' },
        { status: 400 }
      );
    }

    // TODO: Update in database when Notification model is created

    return NextResponse.json({
      success: true,
      message: `Notification marked as ${action} (mock - database not yet configured)`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PATCH /api/notifications] Error:", msg);
    return NextResponse.json(
      { error: "Failed to update notification", details: msg },
      { status: 500 }
    );
  }
}

// POST /api/notifications/clear-all - Clear all notifications
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    // TODO: Clear all notifications in database when Notification model is created

    return NextResponse.json({
      success: true,
      message: "Notifications cleared (mock - database not yet configured)",
      cleared: 0,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[POST /api/notifications] Error:", msg);
    return NextResponse.json(
      { error: "Failed to clear notifications", details: msg },
      { status: 500 }
    );
  }
}
