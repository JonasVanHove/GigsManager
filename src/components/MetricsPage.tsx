"use client";

import { useEffect, useState } from "react";

interface MetricsSummary {
  totalMetrics: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  byEndpoint: Record<
    string,
    { count: number; avgTime: number; maxTime: number }
  >;
}

interface WebVitalsSummary {
  totalVitals: number;
  byName: Record<
    string,
    {
      count: number;
      avgValue: number;
      maxValue: number;
      goodCount: number;
      needsImprovementCount: number;
      poorCount: number;
    }
  >;
}

interface MetricsData {
  timestamp: string;
  metrics: { summary: MetricsSummary };
  vitals: { summary: WebVitalsSummary };
}

export default function MetricsPage() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch("/api/health/metrics");
        if (res.ok) {
          const json = (await res.json()) as MetricsData;
          setData(json);
        }
      } catch (error) {
        console.error("Failed to fetch metrics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();

    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, 5000);
      return () => clearInterval(interval);
    }
  }, [autoRefresh]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-600 dark:text-slate-400">No metrics data available</p>
      </div>
    );
  }

  const { metrics, vitals } = data;
  const metricsSum = metrics.summary;
  const vitalsSum = vitals.summary;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
            Performance Metrics
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Real-time API and Web Vitals monitoring
          </p>
        </div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="rounded border-slate-300"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Auto-refresh (5s)
          </span>
        </label>
      </div>

      {/* API Metrics */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          API Performance
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Requests */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Total Requests
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {metricsSum.totalMetrics}
            </p>
          </div>

          {/* Average Duration */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Avg Duration
            </p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
              {metricsSum.averageDuration.toFixed(2)}
              <span className="text-sm font-normal text-slate-600 dark:text-slate-400">
                ms
              </span>
            </p>
          </div>

          {/* Min Duration */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Min Duration
            </p>
            <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {metricsSum.minDuration.toFixed(2)}
              <span className="text-sm font-normal text-slate-600 dark:text-slate-400">
                ms
              </span>
            </p>
          </div>

          {/* Max Duration */}
          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
              Max Duration
            </p>
            <p className="mt-2 text-2xl font-bold text-red-600 dark:text-red-400">
              {metricsSum.maxDuration.toFixed(2)}
              <span className="text-sm font-normal text-slate-600 dark:text-slate-400">
                ms
              </span>
            </p>
          </div>
        </div>

        {/* Endpoints breakdown */}
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-6 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">
                  Endpoint
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">
                  Count
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">
                  Avg (ms)
                </th>
                <th className="px-6 py-3 text-right text-sm font-semibold text-slate-900 dark:text-white">
                  Max (ms)
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(metricsSum.byEndpoint)
                .sort(([_, a], [__, b]) => b.avgTime - a.avgTime)
                .map(([endpoint, stats]) => (
                  <tr
                    key={endpoint}
                    className="border-b border-slate-100 dark:border-slate-700"
                  >
                    <td className="px-6 py-3 text-sm text-slate-700 dark:text-slate-300">
                      {endpoint}
                    </td>
                    <td className="px-6 py-3 text-right text-sm text-slate-700 dark:text-slate-300">
                      {stats.count}
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-medium text-slate-900 dark:text-white">
                      {stats.avgTime.toFixed(2)}
                    </td>
                    <td className="px-6 py-3 text-right text-sm font-medium text-slate-900 dark:text-white">
                      {stats.maxTime.toFixed(2)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Web Vitals */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Web Vitals
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(vitalsSum.byName).map(([name, stats]) => {
            const goodRate = ((stats.goodCount / stats.count) * 100).toFixed(0);
            const needsImprovementRate = (
              (stats.needsImprovementCount / stats.count) *
              100
            ).toFixed(0);

            return (
              <div
                key={name}
                className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
              >
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  {name}
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">
                  {stats.avgValue.toFixed(2)}
                  <span className="text-sm font-normal text-slate-600 dark:text-slate-400">
                    ms
                  </span>
                </p>
                <div className="mt-3 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-emerald-600 dark:text-emerald-400">
                      ✓ Good: {goodRate}%
                    </span>
                  </div>
                  {parseInt(needsImprovementRate) > 0 && (
                    <div className="flex justify-between">
                      <span className="text-amber-600 dark:text-amber-400">
                        ⚠ Needs improvement: {needsImprovementRate}%
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Last updated */}
      <div className="text-right text-xs text-slate-500 dark:text-slate-400">
        Last updated: {new Date(data.timestamp).toLocaleTimeString()}
      </div>
    </div>
  );
}
