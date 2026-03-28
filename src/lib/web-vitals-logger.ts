/**
 * Web Vitals logging and tracking
 * Monitors Largest Contentful Paint, First Input Delay, Cumulative Layout Shift
 */

export interface WebVital {
  name: string;
  value: number;
  rating: "good" | "needs improvement" | "poor";
  delta: number;
  id: string;
  navigationType: string;
}

interface VitalThresholds {
  good: number;
  needsImprovement: number;
}

const THRESHOLDS: Record<string, VitalThresholds> = {
  LCP: { good: 2500, needsImprovement: 4000 },
  FID: { good: 100, needsImprovement: 300 },
  CLS: { good: 0.1, needsImprovement: 0.25 },
  FCP: { good: 1800, needsImprovement: 3000 },
  TTFB: { good: 600, needsImprovement: 1800 },
};

const vitals: WebVital[] = [];

/**
 * Rate a vital based on thresholds
 */
function rateVital(name: string, value: number): "good" | "needs improvement" | "poor" {
  const threshold = THRESHOLDS[name];
  if (!threshold) return "good";
  if (value <= threshold.good) return "good";
  if (value <= threshold.needsImprovement) return "needs improvement";
  return "poor";
}

/**
 * Record a Web Vital
 */
export function recordWebVital(vital: WebVital): void {
  const ratedVital = {
    ...vital,
    rating: rateVital(vital.name, vital.value),
  };
  vitals.push(ratedVital);

  if (process.env.NODE_ENV === "development") {
    const emoji =
      ratedVital.rating === "good" ? "✓" : ratedVital.rating === "needs improvement" ? "⚠" : "✗";
    console.log(
      `[VITAL] ${emoji} ${vital.name}: ${vital.value.toFixed(2)}ms (${ratedVital.rating})`
    );
  }
}

/**
 * Get Web Vitals summary
 */
export function getWebVitalsSummary() {
  if (vitals.length === 0) {
    return {
      totalVitals: 0,
      byName: {},
      averageRating: "good" as const,
    };
  }

  const byName: Record<
    string,
    {
      count: number;
      avgValue: number;
      maxValue: number;
      goodCount: number;
      needsImprovementCount: number;
      poorCount: number;
    }
  > = {};

  for (const vital of vitals) {
    if (!byName[vital.name]) {
      byName[vital.name] = {
        count: 0,
        avgValue: 0,
        maxValue: 0,
        goodCount: 0,
        needsImprovementCount: 0,
        poorCount: 0,
      };
    }
    byName[vital.name].count += 1;
    byName[vital.name].avgValue += vital.value;
    byName[vital.name].maxValue = Math.max(byName[vital.name].maxValue, vital.value);

    if (vital.rating === "good") byName[vital.name].goodCount += 1;
    else if (vital.rating === "needs improvement") byName[vital.name].needsImprovementCount += 1;
    else byName[vital.name].poorCount += 1;
  }

  for (const key in byName) {
    byName[key].avgValue = byName[key].avgValue / byName[key].count;
  }

  return {
    totalVitals: vitals.length,
    byName,
  };
}

/**
 * Get recent vitals
 */
export function getRecentVitals(limit = 50): WebVital[] {
  return vitals.slice(-limit);
}

/**
 * Clear all vitals
 */
export function clearVitals(): void {
  vitals.length = 0;
}
