import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getOrCreateUser } from "@/lib/auth-helpers";
import { generateGigsCsv, generateFinancialSummaryCsv, generateFinancialReportJson } from "@/lib/export";

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

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const { user } = authResult as { user: { id: string } };

  try {
    const type = request.nextUrl.searchParams.get("type") || "gigs"; // "gigs", "summary", "report"
    const format = request.nextUrl.searchParams.get("format") || "csv"; // "csv", "json"

    // Fetch all gigs for this user
    const gigs = await prisma.gig.findMany({
      where: { userId: user.id },
      include: {
        bandMembers: {
          include: {
            member: true,
          },
        },
      },
      orderBy: { date: "desc" },
    });

    if (gigs.length === 0) {
      return NextResponse.json(
        { error: "No gigs found" },
        { status: 404 }
      );
    }

    let content: string;
    let filename: string;
    let contentType: string;

    if (type === "report") {
      // Financial report as JSON (ready for PDF generation)
      const data = generateFinancialReportJson(gigs);
      content = JSON.stringify(data, null, 2);
      filename = `financial-report-${new Date().toISOString().split("T")[0]}.json`;
      contentType = "application/json";
    } else if (type === "summary") {
      // Financial summary CSV
      content = generateFinancialSummaryCsv(gigs);
      filename = `financial-summary-${new Date().toISOString().split("T")[0]}.csv`;
      contentType = "text/csv";
    } else {
      // Detailed gigs CSV
      content = generateGigsCsv(gigs);
      filename = `gigs-${new Date().toISOString().split("T")[0]}.csv`;
      contentType = "text/csv";
    }

    return new NextResponse(content, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[GET /api/exports/summary] Error:", msg);
    return NextResponse.json(
      { error: "Failed to generate export", details: msg },
      { status: 500 }
    );
  }
}
