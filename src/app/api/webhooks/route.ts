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

// GET /api/webhooks - List webhooks
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    // TODO: Fetch from database when Webhook model is created
    // For now, return empty array with proper structure
    return NextResponse.json({
      webhooks: [],
      message: "Webhook model not yet created in database",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[GET /api/webhooks] Error:", msg);
    return NextResponse.json(
      { error: "Failed to fetch webhooks", details: msg },
      { status: 500 }
    );
  }
}

// POST /api/webhooks - Create webhook
export async function POST(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const body = await request.json();
    const { url, provider, events, name, enabled = true } = body;

    if (!url || !provider || !Array.isArray(events) || events.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: url, provider, events" },
        { status: 400 }
      );
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid webhook URL" },
        { status: 400 }
      );
    }

    // TODO: Save to database when Webhook model is created
    // For now, return mock response
    const webhook = {
      id: `webhook_${Date.now()}`,
      userId: user.id,
      url,
      provider,
      events,
      name: name || `${provider} Webhook`,
      enabled,
      createdAt: new Date(),
    };

    return NextResponse.json({
      success: true,
      webhook,
      message: "Webhook created (mock - database not yet configured)",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[POST /api/webhooks] Error:", msg);
    return NextResponse.json(
      { error: "Failed to create webhook", details: msg },
      { status: 500 }
    );
  }
}

// PATCH /api/webhooks/:id - Update webhook
export async function PATCH(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get("id");

    if (!webhookId) {
      return NextResponse.json(
        { error: "Webhook ID required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { enabled, events, name } = body;

    // TODO: Update in database when Webhook model is created

    return NextResponse.json({
      success: true,
      message: "Webhook updated (mock - database not yet configured)",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[PATCH /api/webhooks] Error:", msg);
    return NextResponse.json(
      { error: "Failed to update webhook", details: msg },
      { status: 500 }
    );
  }
}

// DELETE /api/webhooks/:id - Delete webhook
export async function DELETE(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const { searchParams } = new URL(request.url);
    const webhookId = searchParams.get("id");

    if (!webhookId) {
      return NextResponse.json(
        { error: "Webhook ID required" },
        { status: 400 }
      );
    }

    // TODO: Delete from database when Webhook model is created

    return NextResponse.json({
      success: true,
      message: "Webhook deleted (mock - database not yet configured)",
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[DELETE /api/webhooks] Error:", msg);
    return NextResponse.json(
      { error: "Failed to delete webhook", details: msg },
      { status: 500 }
    );
  }
}
