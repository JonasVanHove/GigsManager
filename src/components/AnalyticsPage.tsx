"use client";

import { useMemo } from "react";
import type { Gig } from "@/types";
import { formatCurrency, formatDate } from "@/lib/calculations";

interface AnalyticsPageProps {
  gigs: Gig[];
  fmtCurrency: (amount: number) => string;
}

export default function AnalyticsPage({ gigs, fmtCurrency }: AnalyticsPageProps) {
  // ── Computed stats ──────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const paid = gigs.filter((g) => g.paymentReceived);
    const unpaid = gigs.filter((g) => !g.paymentReceived);
    const bandPaid = gigs.filter((g) => g.bandPaid);
    const bandUnpaid = gigs.filter((g) => !g.bandPaid);
    const charityGigs = gigs.filter((g) => g.isCharity);
    const regularGigs = gigs.filter((g) => !g.isCharity);
    const gigsWithAdvance = gigs.filter((g) => g.advanceReceivedByManager > 0 || g.advanceToMusicians > 0);

    const totalReceived = paid.reduce((sum, g) => sum + (g.performanceFee + g.technicalFee), 0);
    const totalEarned = paid.reduce((sum, g) => {
      const perfShare = g.claimPerformanceFee ? g.performanceFee / g.numberOfMusicians : 0;
      const techShare = g.technicalFeeClaimAmount ?? (g.claimTechnicalFee ? g.technicalFee : 0);
      return sum + perfShare + techShare;
    }, 0);

    const charityEarnings = charityGigs.reduce((sum, g) => sum + (g.performanceFee + g.technicalFee), 0);
    const totalAdvanceReceived = gigsWithAdvance.reduce((sum, g) => sum + g.advanceReceivedByManager, 0);
    const totalAdvancePaid = gigsWithAdvance.reduce((sum, g) => sum + g.advanceToMusicians, 0);

    const avgGigSize = gigs.length > 0 ? totalReceived / gigs.length : 0;
    const avgEarningsPerGig = paid.length > 0 ? totalEarned / paid.length : 0;

    // Payment timeline
    const timeline = paid
      .map((g) => ({
        date: g.paymentReceivedDate ? new Date(g.paymentReceivedDate) : new Date(g.date),
        amount: g.performanceFee + g.technicalFee,
        eventName: g.eventName,
        received: g.paymentReceived,
      }))
      .sort((a, b) => b.date.getTime() - a.date.getTime());

    // Monthly breakdown with booking dates
    const monthlyData: Record<string, { count: number; total: number; charity: number; paidGigs: number }> = {};
    gigs.forEach((g) => {
      const date = new Date(g.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyData[key]) monthlyData[key] = { count: 0, total: 0, charity: 0, paidGigs: 0 };
      monthlyData[key].count += 1;
      if (g.isCharity) {
        monthlyData[key].charity += 1;
      }
      if (g.paymentReceived) {
        monthlyData[key].paidGigs += 1;
        monthlyData[key].total += g.performanceFee + g.technicalFee;
      }
    });

    const months = Object.entries(monthlyData)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 12)
      .reverse();

    // Calculate busiest/quietest months of year
    const monthsByCalMonth: Record<string, { count: number; total: number; years: number }> = {};
    months.forEach(([monthKey, data]) => {
      const [year, month] = monthKey.split("-");
      if (!monthsByCalMonth[month]) monthsByCalMonth[month] = { count: 0, total: 0, years: 0 };
      monthsByCalMonth[month].count += data.count;
      monthsByCalMonth[month].total += data.total;
      monthsByCalMonth[month].years += 1;
    });

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthPatterns = Object.entries(monthsByCalMonth).map(([monthNum, data]) => ({
      month: monthNames[parseInt(monthNum) - 1],
      monthNum: parseInt(monthNum),
      avgGigs: Math.round(data.count / data.years),
      avgIncome: data.total / data.years,
      totalGigs: data.count,
    })).sort((a, b) => b.avgGigs - a.avgGigs);

    const currentMonth = new Date().getMonth() + 1;
    const currentMonthPattern = monthPatterns.find((m) => m.monthNum === currentMonth);

    return {
      totalGigs: gigs.length,
      paidGigs: paid.length,
      unpaidGigs: unpaid.length,
      totalReceived,
      totalEarned,
      avgGigSize,
      avgEarningsPerGig,
      bandPaidCount: bandPaid.length,
      bandUnpaidCount: bandUnpaid.length,
      charityCount: charityGigs.length,
      regularCount: regularGigs.length,
      charityEarnings,
      gigsWithAdvanceCount: gigsWithAdvance.length,
      totalAdvanceReceived,
      totalAdvancePaid,
      timeline,
      months,
      monthPatterns,
      currentMonthPattern,
      busiestMonth: monthPatterns[0],
      quietestMonth: monthPatterns[monthPatterns.length - 1],
    };
  }, [gigs]);

  return (
    <div className="space-y-6 pb-6">
      {/* ── Key metrics ────────────────────────────────────────────────────── */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-slate-100">Key Metrics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label="Total Gigs"
            value={stats.totalGigs.toString()}
            color="slate"
          />
          <MetricCard
            label="Gigs Paid"
            value={`${stats.paidGigs} / ${stats.totalGigs}`}
            color="emerald"
          />
          <MetricCard
            label="Total Received"
            value={fmtCurrency(stats.totalReceived)}
            color="brand"
          />
          <MetricCard
            label="Average Per Gig"
            value={fmtCurrency(stats.avgGigSize)}
            color="blue"
          />
        </div>
      </div>

      {/* ── Charity & Advance Stats ────────────────────────────────────────── */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-slate-100">Charity & Advances</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label="Charity Performances"
            value={`${stats.charityCount} gigs`}
            color="purple"
          />
          <MetricCard
            label="Advance Payments"
            value={`${stats.gigsWithAdvanceCount} gigs`}
            color="orange"
          />
          <MetricCard
            label="Total Advances Received"
            value={fmtCurrency(stats.totalAdvanceReceived)}
            color="blue"
          />
        </div>
        {stats.gigsWithAdvanceCount > 0 && (
          <div className="mt-4 rounded-xl border border-orange-200 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-950/20 p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-orange-900 dark:text-orange-200">Advance Summary</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-orange-700 dark:text-orange-300">Total Advances Received (from clients)</p>
                <p className="mt-1 text-2xl font-bold text-orange-800 dark:text-orange-200">
                  {fmtCurrency(stats.totalAdvanceReceived)}
                </p>
              </div>
              <div>
                <p className="text-sm text-orange-700 dark:text-orange-300">Total Advances Paid (to musicians)</p>
                <p className="mt-1 text-2xl font-bold text-orange-800 dark:text-orange-200">
                  {fmtCurrency(stats.totalAdvancePaid)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Earnings breakdown ─────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Income</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Total Received (Clients)</span>
              <span className="font-bold text-slate-900 dark:text-slate-100">
                {fmtCurrency(stats.totalReceived)}
              </span>
            </div>
            <div className="h-px bg-slate-200 dark:bg-slate-700" />
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Your Earnings</span>
              <span className="font-bold text-brand-700 dark:text-brand-300">
                {fmtCurrency(stats.totalEarned)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-600 dark:text-slate-400">Band Share</span>
              <span className="font-bold text-amber-700 dark:text-amber-300">
                {fmtCurrency(stats.totalReceived - stats.totalEarned)}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">Payment Status</h3>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Client Payments</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {stats.paidGigs} paid, {stats.unpaidGigs} pending
                </span>
              </div>
              <ProgressBar
                value={stats.paidGigs}
                max={stats.totalGigs}
                color="emerald"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Band Payments</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">
                  {stats.bandPaidCount} paid, {stats.bandUnpaidCount} pending
                </span>
              </div>
              <ProgressBar
                value={stats.bandPaidCount}
                max={stats.totalGigs}
                color="blue"
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Monthly trend ──────────────────────────────────────────────────── */}
      {stats.months.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Monthly Income (Last 12 Months)
          </h3>
          <div className="space-y-3">
            {stats.months.map(([month, data]) => {
              const maxTotal = Math.max(...stats.months.map(([, d]) => d.total), 1);
              const percentage = maxTotal > 0 ? (data.total / maxTotal) * 100 : 0;
              const [year, monthNum] = month.split("-");
              const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleString(
                "en-US",
                { month: "short", year: "numeric" }
              );

              return (
                <div key={month}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{monthName}</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">
                      {fmtCurrency(data.total)} ({data.count} gigs {data.charity > 0 ? `, ${data.charity} charity` : ""})
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-brand-500 dark:bg-brand-600 transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Seasonal Insights ──────────────────────────────────────────────── */}
      {stats.monthPatterns.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Seasonal Insights & Recommendations
          </h3>
          <div className="space-y-4">
            {/* Busiest month */}
            {stats.busiestMonth && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-700/50 bg-emerald-50 dark:bg-emerald-950/20 p-4">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  🔥 Busiest Month: {stats.busiestMonth.month}
                </p>
                <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-300">
                  Average {stats.busiestMonth.avgGigs} gigs per {stats.busiestMonth.month}
                  ({fmtCurrency(stats.busiestMonth.avgIncome)}/year)
                </p>
                <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
                  💡 Tip: Prepare your bands early in this season. Confirm availability with musicians months in advance.
                </p>
              </div>
            )}

            {/* Quietest month */}
            {stats.quietestMonth && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 p-4">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-200">
                  ❄️ Quietest Month: {stats.quietestMonth.month}
                </p>
                <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                  Average {stats.quietestMonth.avgGigs} gigs per {stats.quietestMonth.month}
                  ({fmtCurrency(stats.quietestMonth.avgIncome)}/year)
                </p>
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">
                  💡 Tip: Use this period for marketing and finding new bands. Reach out to venues for off-season bookings.
                </p>
              </div>
            )}

            {/* Current season insight */}
            {stats.currentMonthPattern && (
              <div className="rounded-lg border border-brand-200 dark:border-brand-700/50 bg-brand-50 dark:bg-brand-950/20 p-4">
                <p className="text-sm font-semibold text-brand-900 dark:text-brand-200">
                  📊 {stats.currentMonthPattern.month} (Current): {stats.currentMonthPattern.avgGigs} gigs on average
                </p>
                <p className="mt-2 text-xs text-brand-700 dark:text-brand-400">
                  Based on historical data, you typically have {stats.currentMonthPattern.avgGigs} performances this month.
                  {stats.currentMonthPattern.monthNum === stats.busiestMonth?.monthNum
                    ? " This is your busiest season!"
                    : stats.currentMonthPattern.monthNum === stats.quietestMonth?.monthNum
                      ? " This is typically your quietest period."
                      : " Plan band arrangements accordingly."}
                </p>
              </div>
            )}

            {/* Band management insights */}
            <div className="rounded-lg border border-purple-200 dark:border-purple-700/50 bg-purple-50 dark:bg-purple-950/20 p-4">
              <p className="text-sm font-semibold text-purple-900 dark:text-purple-200">
                👥 Band Management Strategy
              </p>
              <ul className="mt-2 space-y-1 text-xs text-purple-700 dark:text-purple-400">
                <li>
                  • Have {Math.max(2, Math.ceil(stats.busiestMonth?.avgGigs || 1))}+ reliable bands for your peak season
                </li>
                <li>
                  • Consider having one "always-available" core band for last-minute bookings
                </li>
                <li>
                  • Build relationships with session musicians for fills during busy months
                </li>
                {stats.charityCount > 0 && (
                  <li>
                    • You've done {stats.charityCount} charity performances ({Math.round((stats.charityCount / stats.totalGigs) * 100)}% of gigs)
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment timeline ───────────────────────────────────────────────── */}
      {stats.timeline.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Recent Payments
          </h3>
          <div className="space-y-2">
            {stats.timeline.map((payment, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 px-3 py-2 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{payment.eventName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(payment.date.toISOString())}
                  </p>
                </div>
                <p className="font-semibold text-brand-700 dark:text-brand-300">
                  {fmtCurrency(payment.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {gigs.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 py-12 text-center">
          <svg className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2zm0 0V9a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v10m-6 0a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2m0 0V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
          </svg>
          <p className="text-slate-500 dark:text-slate-400">No gigs yet. Add your first performance to see analytics.</p>
        </div>
      )}
    </div>
  );
}

// ─── Helper components ──────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "slate" | "emerald" | "brand" | "blue" | "purple" | "orange";
}) {
  const colorMap = {
    slate: "bg-slate-50 dark:bg-slate-900/30 text-slate-700 dark:text-slate-200 ring-slate-200 dark:ring-slate-700",
    emerald: "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-200 ring-emerald-200 dark:ring-emerald-700/50",
    brand: "bg-brand-50 dark:bg-brand-950/20 text-brand-700 dark:text-brand-200 ring-brand-200 dark:ring-brand-700/50",
    blue: "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-200 ring-blue-200 dark:ring-blue-700/50",
    purple: "bg-purple-50 dark:bg-purple-950/20 text-purple-700 dark:text-purple-200 ring-purple-200 dark:ring-purple-700/50",
    orange: "bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-200 ring-orange-200 dark:ring-orange-700/50",
  };

  return (
    <div className={`rounded-lg border ring-1 ${colorMap[color]} px-4 py-3`}>
      <p className="text-xs font-medium uppercase tracking-wider opacity-75">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

function ProgressBar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: "emerald" | "blue";
}) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const colorMap = {
    emerald: "bg-emerald-500 dark:bg-emerald-600",
    blue: "bg-blue-500 dark:bg-blue-600",
  };

  return (
    <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700">
      <div
        className={`h-full rounded-full transition-all ${colorMap[color]}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}
