"use client";

import { useCallback, useMemo, useState } from "react";
import type { Gig } from "@/types";
import { formatCurrency, formatDate, calculateGigFinancials } from "@/lib/calculations";
import { resolveLocale } from "@/lib/preferences";
import { useSettings } from "./SettingsProvider";
import { Icons } from "./Icons";

interface AnalyticsPageProps {
  gigs: Gig[];
  fmtCurrency: (amount: number) => string;
}

export default function AnalyticsPage({ gigs, fmtCurrency }: AnalyticsPageProps) {
  const { language } = useSettings();
  const [viewMode, setViewMode] = useState<"personal" | "management">("personal");
  const tr = useCallback((en: string, nl: string) => (language === "nl" ? nl : en), [language]);
  
  // -- Computed stats ----------------------------------------------------------

  const stats = useMemo(() => {
    const list = gigs || [];
    const paid = list.filter((g) => g.paymentReceived);
    const unpaid = list.filter((g) => !g.paymentReceived);
    const bandPaid = list.filter((g) => g.bandPaid);
    const bandUnpaid = list.filter((g) => !g.bandPaid);
    const charityGigs = list.filter((g) => g.isCharity);
    const regularGigs = list.filter((g) => !g.isCharity);
    const gigsWithAdvance = list.filter((g) => g.advanceReceivedByManager > 0 || g.advanceToMusicians > 0);

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

    // Monthly breakdown tracks both management (client flow) and personal (my earnings) modes.
    const monthlyManagementData: Record<string, { count: number; total: number; received: number; pending: number; charity: number; paidGigs: number }> = {};
    const monthlyPersonalData: Record<string, { count: number; total: number; received: number; pending: number; charity: number; paidGigs: number }> = {};
    const timeline: Array<{ date: Date; amount: number; eventName: string; received: boolean; kind: "client" | "personal" }> = [];

    list.forEach((g) => {
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
      const myReceivedForGig = g.bandPaid ? calc.myEarnings : calc.myEarningsAlreadyReceived;
      const myPendingForGig = g.bandPaid ? 0 : calc.myEarningsStillOwed;

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

      // Add client-level payment timeline entry when payment received
      if (g.paymentReceived) {
        if (calc.totalReceived > 0) {
          timeline.push({
            date: g.paymentReceivedDate ? new Date(g.paymentReceivedDate) : new Date(g.date),
            amount: calc.totalReceived,
            eventName: g.eventName,
            received: true,
            kind: "client",
          });
        }
      }

      // Add personal-level payment entry when the manager actually received earnings (or an advance)
      if (myReceivedForGig > 0) {
        // Prefer the paymentReceivedDate if present, otherwise use booking/advance date
        const personalDate = g.paymentReceivedDate
          ? new Date(g.paymentReceivedDate)
          : (g.advanceReceivedByManager && g.advanceReceivedByManager > 0)
            ? new Date(g.date)
            : new Date(g.date);

        timeline.push({
          date: personalDate,
          amount: myReceivedForGig,
          eventName: `${g.eventName} — ${tr("My share", "Mijn aandeel")}`,
          received: myReceivedForGig > 0,
          kind: "personal",
        });
      }

      // Add personal-level pending entry when there is still amount owed to the manager
      if (myPendingForGig > 0) {
        timeline.push({
          date: new Date(g.date),
          amount: myPendingForGig,
          eventName: `${g.eventName} — ${tr("Still owed", "Nog te ontvangen")}`,
          received: false,
          kind: "personal",
        });
      }

      const date = new Date(g.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      if (!monthlyManagementData[key]) {
        monthlyManagementData[key] = { count: 0, total: 0, received: 0, pending: 0, charity: 0, paidGigs: 0 };
      }
      monthlyManagementData[key].count += 1;
      monthlyManagementData[key].total += calc.totalReceived;
      monthlyManagementData[key].received += clientReceivedForGig;
      monthlyManagementData[key].pending += clientPendingForGig;

      if (!monthlyPersonalData[key]) {
        monthlyPersonalData[key] = { count: 0, total: 0, received: 0, pending: 0, charity: 0, paidGigs: 0 };
      }
      monthlyPersonalData[key].count += 1;
      monthlyPersonalData[key].total += calc.myEarnings;
      monthlyPersonalData[key].received += myReceivedForGig;
      monthlyPersonalData[key].pending += myPendingForGig;

      if (g.isCharity) {
        monthlyManagementData[key].charity += 1;
        monthlyPersonalData[key].charity += 1;
      }
      if (g.paymentReceived) {
        monthlyManagementData[key].paidGigs += 1;
      }
      if (myPendingForGig === 0) {
        monthlyPersonalData[key].paidGigs += 1;
      }
    });

    timeline.sort((a, b) => b.date.getTime() - a.date.getTime());

    const totalContracted = clientReceived + clientPending;
    const avgGigSize = list.length > 0 ? totalContracted / list.length : 0;
    const avgEarningsPerGig = list.length > 0 ? totalEarned / list.length : 0;

    const monthsManagement = Object.entries(monthlyManagementData)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 12)
      .reverse();

    const monthsPersonal = Object.entries(monthlyPersonalData)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 12)
      .reverse();

    // Calculate busiest/quietest months of year
    const monthsByCalMonth: Record<string, { count: number; total: number; years: number }> = {};
    monthsManagement.forEach(([monthKey, data]) => {
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
      totalGigs: list.length,
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
      monthsManagement,
      monthsPersonal,
      monthPatterns,
      currentMonthPattern,
      busiestMonth: monthPatterns[0],
      quietestMonth: monthPatterns[monthPatterns.length - 1],
    };
  }, [gigs, tr]);

  // Handle empty state
  if (!gigs || gigs.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-900/70 p-8 shadow-sm backdrop-blur">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <Icons.Analytics className="h-8 w-8 text-slate-500" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {tr("No data yet", "Nog geen gegevens")}
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            {tr("Add some gigs to see insights and analytics here.", "Voeg optredens toe om inzichten en analyses hier te zien.")}
          </p>
        </div>
      </div>
    );
  }


  const filteredTimeline = stats.timeline
    .filter((t) => (viewMode === "personal" ? t.kind === "personal" : t.kind === "client"))
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 10);

  const monthlyMode = viewMode === "personal"
    ? {
        months: stats.monthsPersonal,
        received: stats.myReceived,
        pending: stats.myPending,
        total: stats.totalEarned,
        label: tr("Personal Income", "Persoonlijke inkomsten"),
      }
    : {
        months: stats.monthsManagement,
        received: stats.clientReceived,
        pending: stats.clientPending,
        total: stats.totalContracted,
        label: tr("Management Cashflow", "Management cashflow"),
      };

  const monthlyChartData = monthlyMode.months.map(([monthKey, data]) => {
    const [year, month] = monthKey.split("-");
    return {
      monthKey,
      monthName: new Date(parseInt(year), parseInt(month, 10) - 1).toLocaleString(resolveLocale(), {
        month: "short",
        year: "numeric",
      }),
      count: data.count,
      total: data.total,
      received: data.received,
      pending: data.pending,
      charity: data.charity,
      paidGigs: data.paidGigs,
    };
  });

  return (
    <div className="space-y-6 pb-6">
      {/* -- Insights controls ----------------------------------------------- */}
      <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-900/70 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">
              {tr("Insights filters", "Inzichten filters")}
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">
              {tr("Insights", "Inzichten")}
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {tr(
                "Choose one view here. Every panel below follows this selection.",
                "Kies hier één weergave. Alle panelen hieronder volgen deze selectie."
              )}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-nowrap">
            <button
              onClick={() => setViewMode("personal")}
              className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                viewMode === "personal"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {tr("Personal", "Persoonlijk")}
            </button>
            <button
              onClick={() => setViewMode("management")}
              className={`inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition ${
                viewMode === "management"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {tr("Management", "Management")}
            </button>
          </div>
        </div>
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
            <div className="rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/50 backdrop-blur p-6 shadow-md">
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

            <div className="rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/50 backdrop-blur p-6 shadow-md">
              <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-slate-100">{tr("Payment Status", "Betaalstatus")}</h3>
              <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">
                {tr(
                  "This shows the total group contract value first, then your own share received versus total.",
                  "Dit toont eerst de totale groepswaarde, daarna jouw eigen aandeel ontvangen versus totaal."
                )}
              </p>
              <div className="space-y-6">
                {/* Client Payments with financial breakdown */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {tr("Group total contracted", "Totaal contract groepen")}
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{fmtCurrency(stats.clientReceived)}</span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">/ {fmtCurrency(stats.totalContracted)}</span>
                    </div>
                  </div>
                  <ProgressBar
                    value={stats.clientReceived}
                    max={stats.totalContracted}
                    color="emerald"
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{stats.paidGigs} {tr("gigs paid", "optredens betaald")}</span>
                    <span>{stats.clientPending > 0 ? fmtCurrency(stats.clientPending) + " " + tr("outstanding", "openstaand") : tr("All collected", "Alles ontvangen")}</span>
                  </div>
                </div>

                {/* Band Payments with financial breakdown */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {tr("My share received", "Mijn aandeel ontvangen")}
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{fmtCurrency(stats.myReceived)}</span>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">/ {fmtCurrency(stats.totalEarned)}</span>
                    </div>
                  </div>
                  <ProgressBar
                    value={stats.myReceived}
                    max={stats.totalEarned}
                    color="blue"
                  />
                  <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                    <span>{Math.round((stats.myReceived / Math.max(1, stats.totalEarned)) * 100)}% {tr("received", "ontvangen")}</span>
                    <span>{stats.myPending > 0 ? fmtCurrency(stats.myPending) + " " + tr("pending", "in behandeling") : tr("Fully paid", "Volledig betaald")}</span>
                  </div>
                </div>
                {/* Recent payments follow the selected top-level analytics mode */}
                <div className="mt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{tr("Recent Payments", "Recente betalingen")}</span>
                      <small className="text-xs text-slate-500 dark:text-slate-400">{viewMode === "personal" ? tr("Personal view", "Persoonlijke weergave") : tr("Management view", "Managementweergave")}</small>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {filteredTimeline.length === 0 && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{tr("No recent payments for this view.", "Geen recente betalingen voor deze weergave.")}</p>
                    )}
                    {filteredTimeline.map((payment, idx) => {
                      const today = new Date();
                      today.setHours(0,0,0,0);
                      const paymentDay = new Date(payment.date);
                      paymentDay.setHours(0,0,0,0);
                      const amountClass = viewMode === "personal"
                        ? payment.received
                          ? "text-emerald-700 dark:text-emerald-300"
                          : (paymentDay < today
                              ? "text-red-700 dark:text-red-300"
                              : "text-orange-700 dark:text-orange-300")
                        : "text-brand-700 dark:text-brand-300";

                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30 px-3 py-2 text-sm"
                        >
                          <div>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{payment.eventName}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400">{formatDate(payment.date.toISOString())} · {payment.kind === "client" ? tr("Client", "Klant") : tr("Personal", "Persoonlijk")}</p>
                          </div>
                          <p className={`font-semibold ${amountClass}`}>{fmtCurrency(payment.amount)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/50 backdrop-blur p-6 shadow-md lg:col-span-2">
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
      {monthlyMode.months.length > 0 && (
        <MonthlyIncomeChart
          title={tr("Monthly Income (Last 12 Months)", "Maandelijks inkomen (laatste 12 maanden)")}
          modeLabel={monthlyMode.label}
          data={monthlyChartData}
          totalReceived={monthlyMode.received}
          totalPending={monthlyMode.pending}
          totalVolume={monthlyMode.total}
          charityCount={stats.charityCount}
          fmtCurrency={fmtCurrency}
          tr={tr}
        />
      )}

      {/* -- Seasonal Insights ------------------------------------------------ */}
      {stats.monthPatterns.length > 0 && (
        <div className="rounded-xl border border-slate-200/50 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/50 backdrop-blur p-6 shadow-md">
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

function MonthlyIncomeChart({
  title,
  modeLabel,
  data,
  totalReceived,
  totalPending,
  totalVolume,
  charityCount,
  fmtCurrency,
  tr,
}: {
  title: string;
  modeLabel: string;
  data: Array<{
    monthKey: string;
    monthName: string;
    count: number;
    total: number;
    received: number;
    pending: number;
    charity: number;
    paidGigs: number;
  }>;
  totalReceived: number;
  totalPending: number;
  totalVolume: number;
  charityCount: number;
  fmtCurrency: (amount: number) => string;
  tr: (en: string, nl: string) => string;
}) {
  const maxTotal = Math.max(...data.map((entry) => entry.total), 1);
  const hasPending = data.some((entry) => entry.pending > 0);

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 shadow-sm lg:p-6">
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{modeLabel}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <MetricPill
            label={tr("Received", "Ontvangen")}
            value={fmtCurrency(totalReceived)}
            tone="emerald"
          />
          <MetricPill
            label={tr("Pending", "Openstaand")}
            value={fmtCurrency(totalPending)}
            tone="orange"
          />
          <MetricPill
            label={tr("Completion", "Voltooiing")}
            value={totalVolume > 0 ? `${Math.round((totalReceived / totalVolume) * 100)}%` : "0%"}
            tone="slate"
          />
          <MetricPill
            label={tr("Charity gigs", "Charity optredens")}
            value={String(charityCount)}
            tone="rose"
          />
        </div>
      </div>

      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        {tr(
          "Bars show the monthly total. Green is received, orange is still pending.",
          "De balken tonen het maandtotaal. Groen is ontvangen, oranje is nog openstaand."
        )}
      </p>

      <div className="pb-2">
        <div className="md:hidden space-y-3 rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50 via-white to-brand-50/40 p-3 shadow-inner dark:border-slate-700/70 dark:from-slate-900/80 dark:via-slate-900 dark:to-slate-950/70">
          {data.map((entry) => {
            const completion = entry.total > 0 ? Math.round((entry.received / entry.total) * 100) : 0;
            const receivedShare = entry.total > 0 ? (entry.received / entry.total) * 100 : 0;
            const pendingShare = entry.total > 0 ? (entry.pending / entry.total) * 100 : 0;

            return (
              <div key={entry.monthKey} className="rounded-xl border border-slate-200/70 bg-white/90 p-3 shadow-sm dark:border-slate-700/60 dark:bg-slate-900/60">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{entry.monthName}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {entry.count} {tr("gigs", "optredens")} · {completion}% {tr("complete", "voltooid")}
                    </p>
                  </div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{fmtCurrency(entry.total)}</p>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="flex h-full w-full">
                    <div
                      className="h-full bg-emerald-500"
                      style={{ width: `${receivedShare}%` }}
                      title={`${entry.monthName}: ${fmtCurrency(entry.received)} ${tr("received", "ontvangen")}`}
                    />
                    <div
                      className="h-full bg-orange-400"
                      style={{ width: `${pendingShare}%` }}
                      title={`${entry.monthName}: ${fmtCurrency(entry.pending)} ${tr("pending", "openstaand")}`}
                    />
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] font-medium">
                  <span className="text-emerald-700 dark:text-emerald-300">
                    {tr("Received", "Ontvangen")}: {fmtCurrency(entry.received)}
                  </span>
                  <span className="text-orange-700 dark:text-orange-300">
                    {tr("Pending", "Openstaand")}: {fmtCurrency(entry.pending)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="relative hidden h-44 overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-slate-50 via-white to-brand-50/40 px-3 sm:h-72 sm:px-4 pb-4 pt-5 sm:pt-6 shadow-inner dark:border-slate-700/70 dark:from-slate-900/80 dark:via-slate-900 dark:to-slate-950/70 md:block">
            <div className="pointer-events-none absolute inset-0 rounded-2xl bg-[linear-gradient(to_top,rgba(148,163,184,0.18)_1px,transparent_1px)] bg-[length:100%_20%] dark:bg-[linear-gradient(to_top,rgba(51,65,85,0.35)_1px,transparent_1px)]" />
            <div className="pointer-events-none absolute inset-x-4 top-4 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              <span>{tr("Monthly volume", "Maandelijks volume")}</span>
              <span>{tr("Hover for values", "Hover voor waarden")}</span>
            </div>
            <div className="relative flex h-full items-end gap-2 sm:gap-3 pt-5 sm:pt-6 overflow-hidden">
            {data.map((entry) => {
              const chartScale = 0.28;
              const receivedHeight = Math.max(2, (entry.received / maxTotal) * 100 * chartScale);
              const pendingHeight = Math.max(0, (entry.pending / maxTotal) * 100 * chartScale);
              const completion = entry.total > 0 ? Math.round((entry.received / entry.total) * 100) : 0;

              return (
                <div key={entry.monthKey} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2 transition-transform duration-200 hover:-translate-y-1">
                  <div className="relative flex w-full items-end justify-center">
                    <div className="relative flex h-24 sm:h-36 w-full flex-col justify-end overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-900/5 shadow-sm transition-shadow duration-200 group-hover:shadow-lg dark:border-slate-700/60 dark:bg-slate-900/50">
                      <div
                        className="w-full bg-orange-400/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:bg-orange-500/85"
                        style={{ height: hasPending ? `${pendingHeight}%` : "0%" }}
                        title={`${entry.monthName}: ${fmtCurrency(entry.pending)} ${tr("pending", "openstaand")}`}
                      />
                      <div
                        className="w-full rounded-b-2xl bg-gradient-to-t from-emerald-500 via-emerald-500 to-emerald-400 shadow-[inset_0_1px_0_rgba(255,255,255,0.35)] dark:from-emerald-600 dark:via-emerald-500 dark:to-emerald-400"
                        style={{ height: `${receivedHeight}%` }}
                        title={`${entry.monthName}: ${fmtCurrency(entry.received)} ${tr("received", "ontvangen")}`}
                      />
                      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-white/10 via-transparent to-white/25 opacity-60 dark:from-slate-900/20 dark:via-transparent dark:to-white/5" />
                      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/30" />
                    </div>
                  </div>
                  <div className="w-full rounded-xl border border-slate-200/60 bg-white/80 px-2 py-1.5 text-center shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60">
                    <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-200">{entry.monthName}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{entry.count} {tr("gigs", "optredens")}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300">{fmtCurrency(entry.total)}</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{completion}%</p>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
        <div className="grid grid-cols-5 gap-2 bg-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
          <span>{tr("Month", "Maand")}</span>
          <span>{tr("Gigs", "Optredens")}</span>
          <span className="text-right">{tr("Received", "Ontvangen")}</span>
          <span className="text-right">{tr("Pending", "Openstaand")}</span>
          <span className="text-right">{tr("Complete", "Voltooid")}</span>
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {data.map((entry) => {
            const completion = entry.total > 0 ? Math.round((entry.received / entry.total) * 100) : 0;

            return (
              <div key={entry.monthKey} className="grid grid-cols-5 gap-2 px-3 py-3 text-sm text-slate-700 dark:text-slate-200">
                <span className="font-medium text-slate-900 dark:text-slate-100">{entry.monthName}</span>
                <span>{entry.count}</span>
                <span className="text-right font-medium text-emerald-700 dark:text-emerald-300">{fmtCurrency(entry.received)}</span>
                <span className="text-right font-medium text-orange-700 dark:text-orange-300">{fmtCurrency(entry.pending)}</span>
                <span className="text-right font-medium">{completion}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MetricPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "orange" | "slate" | "rose";
}) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-200",
    orange: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-200",
    slate: "border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200",
    rose: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-200",
  } as const;

  return (
    <div className={`rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-75">{label}</p>
      <p className="mt-1 text-sm font-bold leading-5">{value}</p>
    </div>
  );
}

