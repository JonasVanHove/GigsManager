import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUser } from "@/lib/auth-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function requireAuthUser(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { error: "Unauthorized: missing token" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data.user) {
      return NextResponse.json(
        { error: "Unauthorized: invalid token" },
        { status: 401 }
      );
    }

    const user = await getOrCreateUser(
      data.user.id,
      data.user.email || "",
      data.user.user_metadata?.name
    );

    return { user };
  } catch (error) {
    console.error("[requireAuthUser]", error);
    return NextResponse.json(
      { error: "Unauthorized: token validation failed" },
      { status: 401 }
    );
  }
}
