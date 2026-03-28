import { NextRequest, NextResponse } from "next/server";
import { getMetricsSummary, getRecentMetrics } from "@/lib/performance-metrics";
import { getWebVitalsSummary, getRecentVitals } from "@/lib/web-vitals-logger";

/**
 * GET /api/health/metrics - Returns collected performance metrics
 * For monitoring and diagnostics only
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const detailed = searchParams.get("detailed") === "true";

  try {
    const metricsSummary = getMetricsSummary();
    const vitalsSummary = getWebVitalsSummary();

    const response: any = {
      timestamp: new Date().toISOString(),
      metrics: {
        summary: metricsSummary,
      },
      vitals: {
        summary: vitalsSummary,
      },
    };

    if (detailed) {
      response.metrics.recent = getRecentMetrics(50);
      response.vitals.recent = getRecentVitals(50);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("[GET /api/health/metrics] Error:", error);
    return NextResponse.json(
      { error: "Failed to retrieve metrics" },
      { status: 500 }
    );
  }
}
