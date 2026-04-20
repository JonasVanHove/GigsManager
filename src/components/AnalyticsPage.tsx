"use client";

import { useMemo, useState } from "react";
import type { Gig } from "@/types";
import { formatCurrency, formatDate, calculateGigFinancials } from "@/lib/calculations";
import { resolveLocale } from "@/lib/preferences";
import { useSettings } from "./SettingsProvider";

interface AnalyticsPageProps {
  gigs: Gig[];
  fmtCurrency: (amount: number) => string;
}

export default function AnalyticsPage({ gigs, fmtCurrency }: AnalyticsPageProps) {
  const { language } = useSettings();
  const [viewMode, setViewMode] = useState<"personal" | "management">("personal");
  const tr = (en: string, nl: string) => (language === "nl" ? nl : en);
  // -- Computed stats ----------------------------------------------------------

  const stats = useMemo(() => {
    const paid = gigs.filter((g) => g.paymentReceived);
    const unpaid = gigs.filter((g) => !g.paymentReceived);
    const bandPaid = gigs.filter((g) => g.bandPaid);
    const bandUnpaid = gigs.filter((g) => !g.bandPaid);
    const charityGigs = gigs.filter((g) => g.isCharity);
    const regularGigs = gigs.filter((g) => !g.isCharity);
    const gigsWithAdvance = gigs.filter((g) => g.advanceReceivedByManager > 0 || g.advanceToMusicians > 0);

    let clientReceived = 0;
    let clientPending = 0;
    let totalEarned = 0;
    let myReceived = 0;
    let myPending = 0;
    let managedByMeReceived = 0;
    let managedByMePending = 0;
    let externallyManagedForMeReceived = 0;
    let externallyManagedForMePending = 0;

    const charityEarnings = charityGigs.reduce((sum, g) => sum + (g.performanceFee + g.technicalFee), 0);
    const totalAdvanceReceived = gigsWithAdvance.reduce((sum, g) => sum + g.advanceReceivedByManager, 0);
    const totalAdvancePaid = gigsWithAdvance.reduce((sum, g) => sum + g.advanceToMusicians, 0);

    // Monthly breakdown now tracks both received and pending client amounts.
    const monthlyData: Record<string, { count: number; total: number; received: number; pending: number; charity: number; paidGigs: number }> = {};
    const timeline: Array<{ date: Date; amount: number; eventName: string; received: boolean }> = [];

    gigs.forEach((g) => {
      const calc = calculateGigFinancials(
        g.performanceFee,
        g.technicalFee,
        g.managerBonusType,
        g.managerBonusAmount,
        g.numberOfMusicians,
        g.claimPerformanceFee,
        g.claimTechnicalFee,
        g.technicalFeeClaimAmount,
        g.advanceReceivedByManager,
        g.advanceToMusicians,
        g.isCharity
      );

      const clientReceivedForGig = g.paymentReceived
        ? calc.totalReceived
        : Math.min(calc.totalReceived, g.advanceReceivedByManager || 0);
      const clientPendingForGig = Math.max(0, calc.totalReceived - clientReceivedForGig);
      const myReceivedForGig = g.paymentReceived ? calc.myEarnings : calc.myEarningsAlreadyReceived;
      const myPendingForGig = g.paymentReceived ? 0 : calc.myEarningsStillOwed;

      clientReceived += clientReceivedForGig;
      clientPending += clientPendingForGig;
      totalEarned += calc.myEarnings;
      myReceived += myReceivedForGig;
      myPending += myPendingForGig;

      if (g.managerHandlesDistribution) {
        managedByMeReceived += clientReceivedForGig;
        managedByMePending += clientPendingForGig;
      } else {
        externallyManagedForMeReceived += myReceivedForGig;
        externallyManagedForMePending += myPendingForGig;
      }

      if (g.paymentReceived) {
        if (calc.totalReceived > 0) {
          timeline.push({
            date: g.paymentReceivedDate ? new Date(g.paymentReceivedDate) : new Date(g.date),
            amount: calc.totalReceived,
            eventName: g.eventName,
            received: true,
          });
        }
      }

      const date = new Date(g.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyData[key]) {
        monthlyData[key] = { count: 0, total: 0, received: 0, pending: 0, charity: 0, paidGigs: 0 };
      }
      monthlyData[key].count += 1;
      monthlyData[key].total += calc.totalReceived;
      monthlyData[key].received += clientReceivedForGig;
      monthlyData[key].pending += clientPendingForGig;
      if (g.isCharity) {
        monthlyData[key].charity += 1;
      }
      if (g.paymentReceived) {
        monthlyData[key].paidGigs += 1;
      }
    });

    timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

    const totalContracted = clientReceived + clientPending;
    const avgGigSize = gigs.length > 0 ? totalContracted / gigs.length : 0;
    const avgEarningsPerGig = gigs.length > 0 ? totalEarned / gigs.length : 0;

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
      grossReceived: clientReceived,
      clientReceived,
      clientPending,
      totalContracted,
      totalEarned,
      myReceived,
      myPending,
      managedByMeReceived,
      managedByMePending,
      externallyManagedForMeReceived,
      externallyManagedForMePending,
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
      {/* -- View Mode Toggle ------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 p-2">
        <button
          onClick={() => setViewMode("personal")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            viewMode === "personal"
              ? "bg-brand-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          {tr("Personal", "Persoonlijk")}
        </button>
        <button
          onClick={() => setViewMode("management")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            viewMode === "management"
              ? "bg-brand-600 text-white"
              : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          }`}
        >
          {tr("Management", "Management")}
        </button>
      </div>

      {/* -- Key metrics ------------------------------------------------------ */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-slate-100">{tr("Key Metrics", "Kerncijfers")}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            label={tr("Total Gigs", "Totaal optredens")}
            value={stats.totalGigs.toString()}
            color="slate"
          />
          <MetricCard
            label={tr("Gigs Paid", "Optredens betaald")}
            value={`${stats.paidGigs} / ${stats.totalGigs}`}
            color="emerald"
          />
          <MetricCard
            label={tr("Client Received", "Door klant ontvangen")}
            value={fmtCurrency(stats.clientReceived)}
            color="brand"
          />
          <MetricCard
            label={tr("Client Pending", "Nog te ontvangen van klant")}
            value={fmtCurrency(stats.clientPending)}
            color="orange"
          />
        </div>
      </div>

      {/* -- Charity & Advance Stats ------------------------------------------ */}
      <div>
        <h2 className="mb-4 text-xl font-bold text-slate-900 dark:text-slate-100">{tr("Charity & Advances", "Charity & voorschotten")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label={tr("Charity Performances", "Charity-optredens")}
            value={`${stats.charityCount} ${tr("gigs", "optredens")}`}
            color="purple"
          />
          <MetricCard
            label={tr("Advance Payments", "Voorschotten")}
            value={`${stats.gigsWithAdvanceCount} ${tr("gigs", "optredens")}`}
            color="orange"
          />
          <MetricCard
            label={tr("Total Advances Received", "Totaal ontvangen voorschotten")}
            value={fmtCurrency(stats.totalAdvanceReceived)}
            color="blue"
          />
        </div>
        {stats.gigsWithAdvanceCount > 0 && (
          <div className="mt-4 rounded-xl border border-orange-200 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-950/20 p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-orange-900 dark:text-orange-200">{tr("Advance Summary", "Voorschotoverzicht")}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-sm text-orange-700 dark:text-orange-300">{tr("Total Advances Received (from clients)", "Totaal ontvangen voorschotten (van klanten)")}</p>
                <p className="mt-1 text-2xl font-bold text-orange-800 dark:text-orange-200">
                  {fmtCurrency(stats.totalAdvanceReceived)}
                </p>
              </div>
              <div>
                <p className="text-sm text-orange-700 dark:text-orange-300">{tr("Total Advances Paid (to musicians)", "Totaal betaalde voorschotten (aan muzikanten)")}</p>
                <p className="mt-1 text-2xl font-bold text-orange-800 dark:text-orange-200">
                  {fmtCurrency(stats.totalAdvancePaid)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* -- Earnings breakdown ----------------------------------------------- */}
      <div className="grid gap-6 lg:grid-cols-2">
        {viewMode === "personal" ? (
          <>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">{tr("Income", "Inkomsten")}</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{tr("Client received", "Door klant ontvangen")}</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {fmtCurrency(stats.clientReceived)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{tr("Client pending", "Klant nog openstaand")}</span>
                  <span className="font-bold text-orange-700 dark:text-orange-300">
                    {fmtCurrency(stats.clientPending)}
                  </span>
                </div>
                <div className="h-px bg-slate-200 dark:bg-slate-700" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{tr("You already received", "Door jou al ontvangen")}</span>
                  <span className="font-bold text-brand-700 dark:text-brand-300">
                    {fmtCurrency(stats.myReceived)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{tr("You still to receive", "Door jou nog te ontvangen")}</span>
                  <span className="font-bold text-orange-700 dark:text-orange-300">
                    {fmtCurrency(stats.myPending)}
                  </span>
                </div>
                <div className="h-px bg-slate-200 dark:bg-slate-700" />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{tr("You manage yourself", "Zelf door jou beheerd")}</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {fmtCurrency(stats.managedByMeReceived)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{tr("You manage, still open", "Door jou beheerd, nog open")}</span>
                  <span className="font-bold text-orange-700 dark:text-orange-300">
                    {fmtCurrency(stats.managedByMePending)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{tr("Managed by others for you", "Door anderen voor jou beheerd")}</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">
                    {fmtCurrency(stats.externallyManagedForMeReceived)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600 dark:text-slate-400">{tr("Managed by others, still open", "Door anderen beheerd, nog open")}</span>
                  <span className="font-bold text-orange-700 dark:text-orange-300">
                    {fmtCurrency(stats.externallyManagedForMePending)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
              <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">{tr("Payment Status", "Betaalstatus")}</h3>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-slate-600 dark:text-slate-400">{tr("Client Payments", "Klantbetalingen")}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {stats.paidGigs} {tr("paid", "betaald")}, {stats.unpaidGigs} {tr("pending", "openstaand")}
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
                    <span className="text-slate-600 dark:text-slate-400">{tr("Band Payments", "Bandbetalingen")}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {stats.bandPaidCount} {tr("paid", "betaald")}, {stats.bandUnpaidCount} {tr("pending", "openstaand")}
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
          </>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm lg:col-span-2">
              <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">{tr("Total Revenue & Volume", "Totale omzet & volume")}</h3>
              <div className="grid gap-6 sm:grid-cols-3">
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{tr("Total Revenue (All Gigs)", "Totale omzet (alle optredens)")}</p>
                  <p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">
                    {fmtCurrency(stats.totalContracted)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {fmtCurrency(stats.clientReceived)} {tr("received", "ontvangen")} · {fmtCurrency(stats.clientPending)} {tr("pending", "openstaand")}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{tr("Total Gigs", "Totaal optredens")}</p>
                  <p className="mt-2 text-3xl font-bold text-brand-700 dark:text-brand-300">
                    {stats.totalGigs}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-600 dark:text-slate-400">{tr("Revenue per Gig", "Omzet per optreden")}</p>
                  <p className="mt-2 text-3xl font-bold text-blue-700 dark:text-blue-300">
                    {fmtCurrency(stats.avgGigSize)}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* -- Monthly trend ---------------------------------------------------- */}
      {stats.months.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 shadow-sm">
          <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Monthly Income (Last 12 Months)
          </h3>
          <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800/60 dark:bg-emerald-950/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">{tr("Received", "Ontvangen")}</p>
              <p className="mt-0.5 text-sm font-bold text-emerald-800 dark:text-emerald-200">{fmtCurrency(stats.clientReceived)}</p>
            </div>
            <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 dark:border-orange-800/60 dark:bg-orange-950/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">{tr("Pending", "Openstaand")}</p>
              <p className="mt-0.5 text-sm font-bold text-orange-800 dark:text-orange-200">{fmtCurrency(stats.clientPending)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/50">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">{tr("Completion", "Voltooiing")}</p>
              <p className="mt-0.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                {stats.totalContracted > 0 ? `${Math.round((stats.clientReceived / stats.totalContracted) * 100)}%` : "0%"}
              </p>
            </div>
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-800/60 dark:bg-rose-950/20">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">{tr("Charity", "Charity")}</p>
              <p className="mt-0.5 text-sm font-bold text-rose-800 dark:text-rose-200">{stats.charityCount} {tr("gigs", "optredens")}</p>
            </div>
          </div>

          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            {tr("Each month shows total volume and split:", "Elke maand toont totaal volume en verdeling:")} <span className="font-semibold text-emerald-700 dark:text-emerald-300">{tr("received", "ontvangen")}</span> {tr("vs", "vs")} <span className="font-semibold text-orange-700 dark:text-orange-300">{tr("pending", "openstaand")}</span>.
          </p>

          <div className="space-y-3">
            {stats.months.map(([month, data]) => {
              const maxTotal = Math.max(...stats.months.map(([, d]) => d.total), 1);
              const totalPercentage = maxTotal > 0 ? (data.total / maxTotal) * 100 : 0;
              const receivedShare = data.total > 0 ? (data.received / data.total) * 100 : 0;
              const pendingShare = data.total > 0 ? (data.pending / data.total) * 100 : 0;
              const completion = data.total > 0 ? Math.round((data.received / data.total) * 100) : 0;
              const [year, monthNum] = month.split("-");
              const monthName = new Date(parseInt(year), parseInt(monthNum) - 1).toLocaleString(
                resolveLocale(),
                { month: "short", year: "numeric" }
              );

              return (
                <div
                  key={month}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-900/30"
                >
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{monthName}</span>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {data.count} {tr("gigs", "optredens")}
                      </span>
                      {data.charity > 0 && (
                        <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                          {data.charity} {tr("charity", "charity")}
                        </span>
                      )}
                      <span className="inline-flex items-center rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                        {completion}% {tr("complete", "voltooid")}
                      </span>
                    </div>
                  </div>

                  <div className="mb-2 flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">{fmtCurrency(data.total)} {tr("total", "totaal")}</span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {data.charity > 0 ? tr(`including ${data.charity} charity`, `waarvan ${data.charity} charity`) : tr("no charity", "geen charity")}
                    </span>
                  </div>

                  <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-700">
                    <div
                      className="h-full overflow-hidden rounded-full transition-all duration-300"
                      style={{ width: `${totalPercentage}%` }}
                    >
                      <div className="flex h-full w-full">
                        <div
                          className="h-full bg-emerald-500 dark:bg-emerald-600"
                          style={{ width: `${receivedShare}%` }}
                        />
                        <div
                          className="h-full bg-orange-400 dark:bg-orange-500"
                          style={{ width: `${pendingShare}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded bg-emerald-50 px-2 py-1 dark:bg-emerald-950/30">
                      <span className="text-emerald-700 dark:text-emerald-300">{fmtCurrency(data.received)} {tr("received", "ontvangen")}</span>
                    </div>
                    <div className="rounded bg-orange-50 px-2 py-1 text-right dark:bg-orange-950/30">
                      <span className="text-orange-700 dark:text-orange-300">{fmtCurrency(data.pending)} {tr("pending", "openstaand")}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* -- Seasonal Insights ------------------------------------------------ */}
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
            <div className="rounded-lg border border-rose-200 dark:border-rose-700/50 bg-rose-50 dark:bg-rose-950/20 p-4">
              <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                👥 Band Management Strategy
              </p>
              <ul className="mt-2 space-y-1 text-xs text-rose-700 dark:text-rose-400">
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
                    • You've done <span className="font-semibold text-rose-800 dark:text-rose-300">{stats.charityCount} charity performances</span> ({Math.round((stats.charityCount / stats.totalGigs) * 100)}% of gigs)
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* -- Payment timeline ------------------------------------------------- */}
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

// --- Helper components ------------------------------------------------------

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
    purple: "bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-200 ring-rose-200 dark:ring-rose-700/50",
    orange: "bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-200 ring-orange-200 dark:ring-orange-700/50",
  };

  return (
    <div className={`rounded-lg border ring-1 shadow-sm transition duration-200 motion-safe:hover:-translate-y-0.5 motion-safe:hover:shadow-md ${colorMap[color]} px-4 py-3`}>
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
