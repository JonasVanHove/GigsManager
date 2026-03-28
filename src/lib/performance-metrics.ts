/**
 * Performance monitoring and metrics collection
 * Tracks API timings, database query durations, and client-side performance
 */

interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: number;
  endpoint?: string;
  userId?: string;
  status?: number;
  metadata?: Record<string, any>;
}

const metrics: PerformanceMetric[] = [];
const MAX_METRICS_BUFFER = 1000;

/**
 * Record an API or operation timing
 */
export function recordMetric(
  name: string,
  duration: number,
  options?: {
    endpoint?: string;
    userId?: string;
    status?: number;
    metadata?: Record<string, any>;
  }
): void {
  const metric: PerformanceMetric = {
    name,
    duration,
    timestamp: Date.now(),
    ...options,
  };

  metrics.push(metric);

  // Keep buffer bounded
  if (metrics.length > MAX_METRICS_BUFFER) {
    metrics.shift();
  }

  // Log to console in development
  if (process.env.NODE_ENV === "development" && duration > 100) {
    console.log(
      `[PERF] ${name} took ${duration.toFixed(2)}ms${
        options?.endpoint ? ` (${options.endpoint})` : ""
      }`
    );
  }
}

/**
 * Measure and record an async operation
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>,
  options?: {
    endpoint?: string;
    userId?: string;
    metadata?: Record<string, any>;
  }
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - start;
    recordMetric(name, duration, {
      status: 200,
      ...options,
    });
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    recordMetric(name, duration, {
      status: 500,
      ...options,
    });
    throw error;
  }
}

/**
 * Measure and record a sync operation
 */
export function measureSync<T>(
  name: string,
  fn: () => T,
  options?: {
    endpoint?: string;
    userId?: string;
    metadata?: Record<string, any>;
  }
): T {
  const start = performance.now();
  try {
    const result = fn();
    const duration = performance.now() - start;
    recordMetric(name, duration, {
      status: 200,
      ...options,
    });
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    recordMetric(name, duration, {
      status: 500,
      ...options,
    });
    throw error;
  }
}

/**
 * Get summary statistics for all recorded metrics
 */
export function getMetricsSummary() {
  if (metrics.length === 0) {
    return {
      totalMetrics: 0,
      averageDuration: 0,
      minDuration: 0,
      maxDuration: 0,
      byEndpoint: {},
    };
  }

  const byEndpoint: Record<string, { count: number; avgTime: number; maxTime: number }> = {};

  for (const metric of metrics) {
    const key = metric.endpoint || metric.name;
    if (!byEndpoint[key]) {
      byEndpoint[key] = { count: 0, avgTime: 0, maxTime: 0 };
    }
    byEndpoint[key].count += 1;
    byEndpoint[key].avgTime += metric.duration;
    byEndpoint[key].maxTime = Math.max(byEndpoint[key].maxTime, metric.duration);
  }

  for (const key in byEndpoint) {
    byEndpoint[key].avgTime = byEndpoint[key].avgTime / byEndpoint[key].count;
  }

  const durations = metrics.map((m) => m.duration);
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

  return {
    totalMetrics: metrics.length,
    averageDuration: Math.round(avgDuration * 100) / 100,
    minDuration: Math.min(...durations),
    maxDuration: Math.max(...durations),
    byEndpoint,
  };
}

/**
 * Clear all recorded metrics
 */
export function clearMetrics(): void {
  metrics.length = 0;
}

/**
 * Get a copy of recent metrics
 */
export function getRecentMetrics(limit = 50): PerformanceMetric[] {
  return metrics.slice(-limit);
}
