"use client";

import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { useAuth } from "./AuthProvider";
import { useToast } from "./ToastContainer";

interface FinancialReport {
  summary: {
    totalRevenue: number;
    totalMyEarnings: number;
    totalOwedToBand: number;
    charityGigsCount: number;
    paidGigsCount: number;
    totalGigsCount: number;
    clientPaidCount: number;
    clientUnpaidCount: number;
    bandPaidCount: number;
    bandUnpaidCount: number;
  };
  monthlyBreakdown: Array<{
    month: string;
    revenue: number;
    myEarnings: number;
    owedToBand: number;
    gigsCount: number;
  }>;
  gigs: Array<{
    id: string;
    eventName: string;
    date: string;
    isCharity: boolean;
    clientPaymentReceived: boolean;
    bandPaymentComplete: boolean;
    revenue: number;
    myEarnings: number;
    owedToBand: number;
  }>;
}

interface FinancialReportsProps {
  fmtCurrency: (amount: number) => string;
}

/** One payout participant (band member or session musician). */
interface PayoutMember {
  id: string;
  name: string;
  /** Custom-mode share in percent (0-100). */
  percentage: number;
  /** Session musicians are shown distinctly in the breakdown/export. */
  isSession: boolean;
}

let payoutMemberIdSeq = 0;
const newPayoutMember = (name = "", percentage = 0): PayoutMember => ({
  id: `pm-${Date.now()}-${payoutMemberIdSeq++}`,
  name,
  percentage,
  isSession: false,
});

export default function FinancialReports({ fmtCurrency }: FinancialReportsProps) {
  const { getAccessToken } = useAuth();
  const toast = useToast();
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<string>("all");
  const [customDates, setCustomDates] = useState({
    startDate: "",
    endDate: "",
  });

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");
      let url = "/api/reports/financial";

      if (period === "custom") {
        if (customDates.startDate && customDates.endDate) {
          url += `?startDate=${customDates.startDate}&endDate=${customDates.endDate}`;
        }
      } else if (period !== "all") {
        url += `?period=${period}`;
      }

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setReport(data);
    } catch (error) {
      toast.error("Failed to load financial report");
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, period, customDates, toast]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleCustomDateApply = () => {
    if (!customDates.startDate || !customDates.endDate) {
      toast.error("Please select both start and end dates");
      return;
    }
    fetchReport();
  };

  // -- Payout Breakdown (Gageverdeling) -------------------------------------
  // Per-gig calculator: fixed expenses (sound engineer, travel, venue
  // commission) are subtracted from the gig revenue; the remaining net band
  // income is split equally or by custom percentage among the members added
  // below. Everything is computed client-side; nothing is persisted server-side.
  const [payoutGigId, setPayoutGigId] = useState<string>("");
  const [payoutExpenses, setPayoutExpenses] = useState({
    soundEngineer: "",
    travel: "",
    commission: "",
  });
  const [splitMode, setSplitMode] = useState<"equal" | "custom">("equal");
  const [payoutMembers, setPayoutMembers] = useState<PayoutMember[]>([
    newPayoutMember(),
    newPayoutMember(),
  ]);

  const addPayoutMember = () => {
    setPayoutMembers((prev) => [...prev, newPayoutMember(`Member ${prev.length + 1}`, 0)]);
  };

  const removePayoutMember = (id: string) => {
    setPayoutMembers((prev) => (prev.length > 1 ? prev.filter((m) => m.id !== id) : prev));
  };

  const updatePayoutMember = (id: string, patch: Partial<PayoutMember>) => {
    setPayoutMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const parseExpense = (value: string): number => {
    const parsed = Number.parseFloat(value.replace(",", "."));
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  const payoutMath = (() => {
    const selectedGig = report?.gigs?.find((g) => g.id === payoutGigId) ?? null;
    const revenue = selectedGig?.revenue ?? 0;
    const expenseTotal =
      parseExpense(payoutExpenses.soundEngineer) +
      parseExpense(payoutExpenses.travel) +
      parseExpense(payoutExpenses.commission);
    const netIncome = revenue - expenseTotal;
    const activeMembers = payoutMembers.filter((m) => m.name.trim().length > 0);
    const customPercentageSum = activeMembers.reduce((sum, m) => sum + (Number.isFinite(m.percentage) ? m.percentage : 0), 0);
    const payouts = activeMembers.map((m) => ({
      name: m.name.trim(),
      isSession: m.isSession,
      percentage:
        splitMode === "equal"
          ? activeMembers.length > 0
            ? 100 / activeMembers.length
            : 0
          : m.percentage,
      amount:
        splitMode === "equal"
          ? activeMembers.length > 0
            ? netIncome / activeMembers.length
            : 0
          : netIncome * (m.percentage / 100),
    }));
    const distributedTotal = payouts.reduce((sum, p) => sum + p.amount, 0);
    return {
      selectedGig,
      revenue,
      expenseTotal,
      netIncome,
      activeMembers,
      payouts,
      distributedTotal,
      undistributed: netIncome - distributedTotal,
      customPercentageSum,
      percentageMismatch:
        splitMode === "custom" &&
        activeMembers.length > 0 &&
        Math.abs(customPercentageSum - 100) > 0.01,
    };
  })();

  const exportCSV = () => {
    if (!report) return;

    const headers = ["Event Name", "Date", "Type", "Revenue", "My Earnings", "Owed to Band", "Client Paid", "Band Paid"];
    const rows = report.gigs.map(gig => [
      gig.eventName,
      format(new Date(gig.date), "yyyy-MM-dd"),
      gig.isCharity ? "Charity" : "Paid",
      gig.revenue.toFixed(2),
      gig.myEarnings.toFixed(2),
      gig.owedToBand.toFixed(2),
      gig.clientPaymentReceived ? "Yes" : "No",
      gig.bandPaymentComplete ? "Yes" : "No",
    ]);

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-report-${format(new Date(), "yyyy-MM-dd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  };

  const exportJSON = () => {
    if (!report) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      period,
      summary: report.summary,
      monthlyBreakdown: report.monthlyBreakdown,
      gigs: report.gigs.map((gig) => ({
        eventName: gig.eventName,
        date: format(new Date(gig.date), "yyyy-MM-dd"),
        isCharity: gig.isCharity,
        clientPaymentReceived: gig.clientPaymentReceived,
        bandPaymentComplete: gig.bandPaymentComplete,
        revenue: gig.revenue,
        myEarnings: gig.myEarnings,
        owedToBand: gig.owedToBand,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `financial-report-${format(new Date(), "yyyy-MM-dd")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("JSON exported successfully");
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent"></div>
      </div>
    );
  }

  if (!report) return null;

  const { summary, monthlyBreakdown, gigs } = report;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Financial Reports
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Track revenue, earnings, and payments
          </p>
        </div>
        <button
          onClick={exportCSV}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
          </svg>
          Export CSV
        </button>
        <button
          onClick={exportJSON}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 6a3.75 3.75 0 1 1-2.625 2.25l-.75-2.25a3.75 3.75 0 1 1 3 2.25l.75-2.25a3.75 3.75 0 0 0-3-2.25l.75-2.25a3.75 3.75 0 0 0 2.625-2.25" />
          </svg>
          Export JSON
        </button>
      </div>

      {/* Period Selector */}
      <div className="flex flex-wrap gap-3">
        {["all", "month", "quarter", "year"].map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize transition ${
              period === p
                ? "bg-brand-600 text-white shadow-sm"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {p === "all" ? "All Time" : `Last ${p}`}
          </button>
        ))}
        <button
          onClick={() => setPeriod("custom")}
          className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
            period === "custom"
              ? "bg-brand-600 text-white shadow-sm"
              : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          }`}
        >
          Custom Range
        </button>

        {period === "custom" && (
          <div className="flex w-full items-end gap-2 sm:w-auto">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Start Date
              </label>
              <input
                type="date"
                value={customDates.startDate}
                onChange={(e) => setCustomDates({ ...customDates, startDate: e.target.value })}
                className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                End Date
              </label>
              <input
                type="date"
                value={customDates.endDate}
                onChange={(e) => setCustomDates({ ...customDates, endDate: e.target.value })}
                className="mt-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <button
              onClick={handleCustomDateApply}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Payout Breakdown (Gageverdeling) */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-gradient-to-r from-cyan-50 to-emerald-50 px-4 py-3 dark:border-slate-700/50 dark:from-cyan-900/20 dark:to-emerald-900/20">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Payout Breakdown <span className="text-xs text-slate-500 dark:text-slate-400">· Gageverdeling</span>
          </h3>
        </div>
        <div className="px-4 py-4 space-y-4">
          {/* Gig selector */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Gig</label>
            <select
              value={payoutGigId}
              onChange={(e) => setPayoutGigId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">Select a gig…</option>
              {gigs.map((gig) => (
                <option key={gig.id} value={gig.id}>{gig.eventName} — {format(new Date(gig.date), "MMM d, yyyy")}</option>
              ))}
            </select>
          </div>

          {payoutMath.selectedGig && (
            <>
              {/* Expenses */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Sound engineer</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payoutExpenses.soundEngineer}
                    onChange={(e) => setPayoutExpenses({ ...payoutExpenses, soundEngineer: e.target.value })}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Travel / gas</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payoutExpenses.travel}
                    onChange={(e) => setPayoutExpenses({ ...payoutExpenses, travel: e.target.value })}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">Venue commission</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={payoutExpenses.commission}
                    onChange={(e) => setPayoutExpenses({ ...payoutExpenses, commission: e.target.value })}
                    placeholder="0.00"
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Income summary */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
                <span className="text-slate-600 dark:text-slate-400">Revenue</span>
                <span className="font-semibold text-slate-900 dark:text-white">{fmtCurrency(payoutMath.revenue)}</span>
                <span className="text-slate-400">− expenses</span>
                <span className="font-semibold text-rose-600 dark:text-rose-400">−{fmtCurrency(payoutMath.expenseTotal)}</span>
                <span className="text-slate-400">= net band income</span>
                <span className={`font-bold ${payoutMath.netIncome >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}`}>
                  {fmtCurrency(payoutMath.netIncome)}
                </span>
              </div>

              {/* Split mode */}
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 dark:border-slate-600 dark:bg-slate-800/80">
                {(["equal", "custom"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSplitMode(mode)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${splitMode === mode ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white" : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"}`}
                  >
                    {mode === "equal" ? "Equal split" : "Custom %"}
                  </button>
                ))}
              </div>

              {/* Members */}
              {payoutMembers.map((member) => (
                <div key={member.id} className="flex flex-wrap items-center gap-2">
                  <input
                    value={member.name}
                    onChange={(e) => updatePayoutMember(member.id, { name: e.target.value })}
                    placeholder="Member name"
                    className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                    <input
                      type="checkbox"
                      checked={member.isSession}
                      onChange={(e) => updatePayoutMember(member.id, { isSession: e.target.checked })}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-900"
                    />
                    Session
                  </label>
                  {splitMode === "custom" ? (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      value={member.percentage === 0 ? "" : member.percentage}
                      onChange={(e) => updatePayoutMember(member.id, { percentage: Number.parseFloat(e.target.value || "0") })}
                      placeholder="%"
                      className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => removePayoutMember(member.id)}
                    disabled={payoutMembers.length <= 1}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:border-slate-600 dark:text-slate-400"
                    aria-label="Remove member"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addPayoutMember}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                + Add member / session musician
              </button>

              {splitMode === "custom" && payoutMath.activeMembers.length > 0 && payoutMath.percentageMismatch && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Custom percentages sum to {Math.round(payoutMath.customPercentageSum)}% — adjust so the total equals 100%.
                </p>
              )}

              {/* Results */}
              {payoutMath.activeMembers.length > 0 ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="px-2 py-1.5 text-left">Member</th>
                      <th className="px-2 py-1.5 text-right">Share</th>
                      <th className="px-2 py-1.5 text-right">Payout</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {payoutMath.payouts.map((row) => (
                      <tr key={row.name + row.percentage}>
                        <td className="px-2 py-1.5 text-slate-900 dark:text-white">
                          {row.name}{row.isSession ? <span className="ml-1 rounded-full bg-violet-100 px-1.5 text-[10px] text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">session</span> : null}
                        </td>
                        <td className="px-2 py-1.5 text-right text-slate-600 dark:text-slate-400">{row.percentage.toFixed(1)}%</td>
                        <td className="px-2 py-1.5 text-right font-semibold text-emerald-700 dark:text-emerald-300">{fmtCurrency(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 dark:border-slate-700">
                      <td className="px-2 py-1.5 text-xs text-slate-500 dark:text-slate-400">Undistributed</td>
                      <td className="px-2 py-1.5 text-right" />
                      <td className="px-2 py-1.5 text-right font-medium text-slate-700 dark:text-slate-300">{fmtCurrency(payoutMath.undistributed)}</td>
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <p className="text-xs text-slate-500 dark:text-slate-400">Add at least one member with a name to see the split.</p>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-gradient-to-br from-blue-50 to-cyan-50 px-4 py-3 dark:border-slate-700/50 dark:from-blue-900/20 dark:to-cyan-900/20">
            <p className="text-xs font-medium uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Total Revenue
            </p>
          </div>
          <div className="px-4 py-4">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {fmtCurrency(summary.totalRevenue)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {summary.totalGigsCount} gigs ({summary.charityGigsCount} charity)
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-gradient-to-br from-emerald-50 to-teal-50 px-4 py-3 dark:border-slate-700/50 dark:from-emerald-900/20 dark:to-teal-900/20">
            <p className="text-xs font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              My Earnings
            </p>
          </div>
          <div className="px-4 py-4">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {fmtCurrency(summary.totalMyEarnings)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {summary.clientPaidCount} / {summary.totalGigsCount} received
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-gradient-to-br from-amber-50 to-yellow-50 px-4 py-3 dark:border-slate-700/50 dark:from-amber-900/20 dark:to-yellow-900/20">
            <p className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
              Owed to Band
            </p>
          </div>
          <div className="px-4 py-4">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {fmtCurrency(summary.totalOwedToBand)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {summary.bandUnpaidCount} pending payments
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-gradient-to-br from-violet-50 to-purple-50 px-4 py-3 dark:border-slate-700/50 dark:from-violet-900/20 dark:to-purple-900/20">
            <p className="text-xs font-medium uppercase tracking-wider text-violet-600 dark:text-violet-400">
              Payment Status
            </p>
          </div>
          <div className="px-4 py-4">
            <p className="text-2xl font-bold text-slate-900 dark:text-white">
              {Math.round((summary.bandPaidCount / Math.max(summary.totalGigsCount, 1)) * 100)}%
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Band fully paid
            </p>
          </div>
        </div>
      </div>

      {/* Monthly Breakdown */}
      {monthlyBreakdown.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-700/50 dark:bg-slate-800/50">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Monthly Breakdown
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Month
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Gigs
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Revenue
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    My Earnings
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Owed to Band
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {monthlyBreakdown.map((month, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                      {month.month}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700 dark:text-slate-300">
                      {month.gigsCount}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-slate-900 dark:text-white">
                      {fmtCurrency(month.revenue)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      {fmtCurrency(month.myEarnings)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-amber-600 dark:text-amber-400">
                      {fmtCurrency(month.owedToBand)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Gigs Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-700/50 dark:bg-slate-800/50">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Gig Details ({gigs.length})
          </h3>
        </div>
        {gigs.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500 dark:text-slate-400">
              No gigs found for this period
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Event
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Date
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Type
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Revenue
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    My Earnings
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Owed to Band
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {gigs.map((gig) => (
                  <tr key={gig.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-sm font-medium text-slate-900 dark:text-white">
                      {gig.eventName}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-slate-700 dark:text-slate-300">
                      {format(new Date(gig.date), "MMM d, yyyy")}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                          gig.isCharity
                            ? "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300"
                            : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                        }`}
                      >
                        {gig.isCharity ? "Charity" : "Paid"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-slate-900 dark:text-white">
                      {fmtCurrency(gig.revenue)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-emerald-600 dark:text-emerald-400">
                      {fmtCurrency(gig.myEarnings)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-amber-600 dark:text-amber-400">
                      {fmtCurrency(gig.owedToBand)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {gig.clientPaymentReceived ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                            Client ✓
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            Client ⏳
                          </span>
                        )}
                        {gig.bandPaymentComplete ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                            Band ✓
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                            Band ⏳
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
