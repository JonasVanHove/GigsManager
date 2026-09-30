"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "./AuthProvider";
import type { Gig, Investment, InvestmentFormData } from "@/types";
import LoadingSpinner from "./LoadingSpinner";
import { calculateGigFinancials } from "@/lib/calculations";
import { useSettings } from "./SettingsProvider";
import { Icons } from "./Icons";
import { normalizeArrayResponse } from "@/lib/api-response";

interface BandMemberOption {
  id: string;
  name: string;
}

interface InvestmentsTabProps {
  fmtCurrency: (amount: number) => string;
}

export default function InvestmentsTab({ fmtCurrency }: InvestmentsTabProps) {
  const { session, getAccessToken } = useAuth();
  const { language } = useSettings();
  const defaultForm = (): InvestmentFormData => ({
    amount: 0,
    sharedWithMusician: false,
    contributorIds: [],
    description: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [gigs, setGigs] = useState<Gig[]>([]);
  const [bandMembers, setBandMembers] = useState<BandMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InvestmentFormData>(defaultForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const copy = language === "nl"
    ? {
        title: "Investeringen",
        subtitle: "Houd uitgaven bij die je nettowinst verlagen",
        addInvestment: "Investering toevoegen",
        cancel: "Annuleren",
        editInvestment: "Investering bewerken",
        amount: "Bedrag",
        descriptionOptional: "Omschrijving (optioneel)",
        descriptionPlaceholder: "bijv. Nieuwe geluidsapparatuur",
        sharingTitle: "Muzikanten die deze investering delen",
        sharingHelp: "Het totaal wordt gelijk verdeeld over jou en iedereen die hier is geselecteerd.",
        clear: "Wissen",
        noBandMembers: "Nog geen bandleden gevonden.",
        splitAmong: "Gedeeld met",
        peopleIncludingYou: "personen, inclusief jij",
        date: "Datum",
        saveChanges: "Wijzigingen opslaan",
        saveInvestment: "Investering opslaan",
        saving: "Opslaan...",
        totalInvested: "Totaal geïnvesteerd (jouw deel)",
        totalCost: "Totaalkost",
        earned: "Verdiend",
        received: "Ontvangen",
        cashIn: "Binnengekomen geld",
        pending: "Openstaand",
        pendingHelp: "Nog te ontvangen",
        currentBalance: "Huidig saldo",
        projected: "Geprojecteerd",
        loading: "Investeringen laden...",
        emptyTitle: "Nog geen investeringen",
        emptySubtitle: "Voeg je eerste investering toe om uitgaven bij te houden",
        investment: "Investering",
        edit: "Investering bewerken",
        delete: "Investering verwijderen",
        total: "totaal",
        gig: "optreden",
        gigs: "optredens",
      }
    : {
        title: "Investments",
        subtitle: "Track expenses that reduce your net profit",
        addInvestment: "Add Investment",
        cancel: "Cancel",
        editInvestment: "Edit Investment",
        amount: "Amount",
        descriptionOptional: "Description (optional)",
        descriptionPlaceholder: "e.g., New sound equipment",
        sharingTitle: "Musicians sharing this investment",
        sharingHelp: "The total is split equally between you and everyone selected here.",
        clear: "Clear",
        noBandMembers: "No band members found yet.",
        splitAmong: "Split among",
        peopleIncludingYou: "people including you",
        date: "Date",
        saveChanges: "Save Changes",
        saveInvestment: "Save Investment",
        saving: "Saving...",
        totalInvested: "Total Invested (your share)",
        totalCost: "Total cost",
        earned: "Earned",
        received: "Received",
        cashIn: "Cash in",
        pending: "Pending",
        pendingHelp: "Still to receive",
        currentBalance: "Current balance",
        projected: "Projected",
        loading: "Loading investments...",
        emptyTitle: "No investments yet",
        emptySubtitle: "Add your first investment to track expenses",
        investment: "Investment",
        edit: "Edit investment",
        delete: "Delete investment",
        total: "total",
        gig: "gig",
        gigs: "gigs",
      };

  const fetchInvestments = useCallback(async () => {
    if (!session?.user) {
      setInvestments([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const token = await getAccessToken();

      if (!token) {
        setLoading(false);
        setTimeout(fetchInvestments, 500);
        return;
      }

      const res = await fetch("/api/investments", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to fetch investments");
      }

      const data = await res.json();
      setInvestments(data);
    } catch (err) {
      console.error("Fetch investments error:", err);
      setError("Failed to load investments");
    } finally {
      setLoading(false);
    }
  }, [session?.user, getAccessToken]);

  const fetchBandMembers = useCallback(async () => {
    if (!session?.user) {
      setBandMembers([]);
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) return;

      const response = await fetch("/api/band-members", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        setBandMembers([]);
        return;
      }

      const data = await response.json().catch(() => []);
      const members = normalizeArrayResponse<{ id: string; name: string }>(data);
      setBandMembers(
        members.map((member) => ({ id: member.id, name: member.name }))
      );
    } catch (error) {
      console.error("Fetch band members error:", error);
      setBandMembers([]);
    }
  }, [session?.user, getAccessToken]);

  const fetchGigs = useCallback(async () => {
    if (!session?.user) {
      console.log("[InvestmentsTab fetchGigs] No user session, skipping");
      setGigs([]);
      return;
    }

    try {
      console.log("[InvestmentsTab fetchGigs] Getting token...");
      const token = await getAccessToken();
      if (!token) {
        console.log("[InvestmentsTab fetchGigs] No token available");
        return;
      }

      console.log("[InvestmentsTab fetchGigs] Fetching gigs from API...");
      const res = await fetch("/api/gigs", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        console.error("[InvestmentsTab fetchGigs] API returned status:", res.status);
        return;
      }

      const response = await res.json();
      console.log("[InvestmentsTab fetchGigs] API response:", response);

      // Handle both direct array response and { data: [...] } response
      let gigsArray = [];
      if (Array.isArray(response)) {
        gigsArray = response;
      } else if (response?.data && Array.isArray(response.data)) {
        gigsArray = response.data;
      } else {
        console.warn("[InvestmentsTab fetchGigs] Unexpected response format:", response);
      }

      console.log("[InvestmentsTab fetchGigs] ✓ Success: setting", gigsArray.length, 'gigs');
      setGigs(gigsArray);
    } catch (err) {
      console.error("[InvestmentsTab fetchGigs] Error:", err);
    }
  }, [session?.user, getAccessToken]);

  useEffect(() => {
    fetchInvestments();
    fetchBandMembers();
    fetchGigs();
  }, [session?.user, fetchInvestments, fetchBandMembers, fetchGigs]);

  const resetForm = () => {
    setForm(defaultForm());
    setEditingId(null);
  };

  const handleStartEdit = (investment: Investment) => {
    setForm({
      amount: investment.amount,
      sharedWithMusician: investment.sharedWithMusician,
      contributorIds: investment.contributors?.map((item) => item.bandMemberId) || [],
      description: investment.description || "",
      date: investment.date ? investment.date.split("T")[0] : new Date().toISOString().split("T")[0],
    });
    setEditingId(investment.id);
    setError("");
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.amount || form.amount <= 0) {
      setError("Amount must be greater than 0");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const token = await getAccessToken();

      if (!token) {
        throw new Error("No token available");
      }

      const isEditing = Boolean(editingId);
      const res = await fetch(`/api/investments${isEditing ? `?id=${editingId}` : ""}`, {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          sharedWithMusician: form.contributorIds.length > 0,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || (isEditing ? "Failed to update investment" : "Failed to create investment"));
      }

      const savedInvestment = await res.json();
      if (isEditing) {
        setInvestments((current) =>
          current.map((investment) =>
            investment.id === savedInvestment.id ? savedInvestment : investment
          )
        );
      } else {
        setInvestments((current) => [savedInvestment, ...current]);
      }
      resetForm();
      setShowForm(false);
    } catch (err) {
      console.error("Save investment error:", err);
      setError(err instanceof Error ? err.message : "Failed to save investment");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this investment?")) {
      return;
    }

    setDeleting(id);
    setError("");

    try {
      const token = await getAccessToken();

      if (!token) {
        throw new Error("No token available");
      }

      const res = await fetch(`/api/investments?id=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error("Failed to delete investment");
      }

      setInvestments((current) => current.filter((inv) => inv.id !== id));
    } catch (err) {
      console.error("Delete investment error:", err);
      setError("Failed to delete investment");
    } finally {
      setDeleting(null);
    }
  };

  const getContributorCount = (investment: Investment) => {
    if (investment.contributors && investment.contributors.length > 0) {
      return investment.contributors.length;
    }

    return investment.sharedWithMusician ? 1 : 0;
  };

  const getContributorNames = (investment: Investment) => {
    if (investment.contributors && investment.contributors.length > 0) {
      return investment.contributors.map((item) => item.bandMember.name);
    }

    return investment.sharedWithMusician ? ["A musician"] : [];
  };

  const getYourShare = (investment: Investment) => {
    const contributorCount = getContributorCount(investment);
    return contributorCount > 0 ? investment.amount / (contributorCount + 1) : investment.amount;
  };

  const totalInvested = investments.reduce((sum, inv) => sum + getYourShare(inv), 0);
  const totalCost = investments.reduce((sum, inv) => sum + inv.amount, 0);
  const earningsSummary = useMemo(
    () => {
      const summary = gigs.reduce(
        (acc, gig) => {
          const c = calculateGigFinancials(
            gig.performanceFee,
            gig.technicalFee,
            gig.managerBonusType,
            gig.managerBonusAmount,
            gig.numberOfMusicians,
            gig.claimPerformanceFee,
            gig.claimTechnicalFee,
            gig.technicalFeeClaimAmount,
            gig.advanceReceivedByManager,
            gig.advanceToMusicians,
            gig.isCharity
          );

          acc.totalEarned += c.myEarnings;
          if (gig.bandPaid) {
            acc.totalEarnedReceived += c.myEarnings;
          } else {
            acc.totalEarnedReceived += c.myEarningsAlreadyReceived;
            acc.totalEarnedPending += c.myEarningsStillOwed;
          }
          return acc;
        },
        {
          totalEarned: 0,
          totalEarnedReceived: 0,
          totalEarnedPending: 0,
        }
      );
      
      console.log("[InvestmentsTab] earningsSummary result:", {
        totalEarned: summary.totalEarned,
        totalEarnedReceived: summary.totalEarnedReceived,
        totalEarnedPending: summary.totalEarnedPending,
        gigsCount: gigs.length
      });
      
      return summary;
    },
    [gigs]
  );

  const totalEarned = earningsSummary.totalEarned;
  const totalEarnedReceived = earningsSummary.totalEarnedReceived;
  const totalEarnedPending = earningsSummary.totalEarnedPending;
  const currentBalance = totalEarnedReceived - totalInvested;
  const projectedBalance = totalEarned - totalInvested;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            {copy.title}
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {copy.subtitle}
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) {
              resetForm();
              setError("");
            }
            setShowForm(!showForm);
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 dark:hover:bg-brand-700"
        >
          <Icons.Wallet className="h-4 w-4" />
          {showForm ? copy.cancel : copy.addInvestment}
        </button>
      </div>

      {showForm && (
        <div className="surface-card rounded-2xl p-6">
          <h4 className="mb-4 font-semibold text-slate-900 dark:text-white">
            {editingId ? copy.editInvestment : copy.addInvestment}
          </h4>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                {copy.amount}
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
                placeholder="0.00"
                value={form.amount || ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    amount: parseFloat(e.target.value) || 0,
                  })
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                {copy.descriptionOptional}
              </label>
              <input
                type="text"
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-500 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
                placeholder={copy.descriptionPlaceholder}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {copy.sharingTitle}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {copy.sharingHelp}
                  </p>
                </div>
                {form.contributorIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, contributorIds: [], sharedWithMusician: false })}
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    {copy.clear}
                  </button>
                )}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {bandMembers.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {copy.noBandMembers}
                  </p>
                ) : (
                  bandMembers.map((member) => {
                    const checked = form.contributorIds.includes(member.id);
                    return (
                      <label
                        key={member.id}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                          checked
                            ? "border-brand-300 bg-brand-50 text-brand-800 dark:border-brand-700 dark:bg-brand-950/30 dark:text-brand-200"
                            : "border-slate-200 bg-slate-50/50 text-slate-700 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600"
                          checked={checked}
                          onChange={(e) => {
                            const nextIds = e.target.checked
                              ? [...form.contributorIds, member.id]
                              : form.contributorIds.filter((id) => id !== member.id);

                            setForm({
                              ...form,
                              contributorIds: nextIds,
                              sharedWithMusician: nextIds.length > 0,
                            });
                          }}
                        />
                        <span className="font-medium">{member.name}</span>
                      </label>
                    );
                  })
                )}
              </div>

              {form.contributorIds.length > 0 && (
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  {copy.splitAmong} {form.contributorIds.length + 1} {copy.peopleIncludingYou}.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                {copy.date}
              </label>
              <input
                type="date"
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving}
              className="mt-4 w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50 dark:hover:bg-brand-700"
            >
              {saving ? copy.saving : editingId ? copy.saveChanges : copy.saveInvestment}
            </button>
          </div>
        </div>
      )}

      <div className="surface-card rounded-2xl p-4">
        <div className="grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-white/85 p-3 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{copy.earned}</p>
            <p className="mt-1 text-lg font-semibold text-slate-600 dark:text-slate-300">{fmtCurrency(totalEarned)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{gigs.length} {gigs.length === 1 ? copy.gig : copy.gigs}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/85 p-3 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{copy.received}</p>
            <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">{fmtCurrency(totalEarnedReceived)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy.cashIn}</p>
          </div>
          <div className="rounded-xl border border-slate-200/80 bg-white/85 p-3 dark:border-slate-700 dark:bg-slate-900/60">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">{copy.pending}</p>
            <p className="mt-1 text-lg font-semibold text-amber-600 dark:text-amber-400">{fmtCurrency(totalEarnedPending)}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{copy.pendingHelp}</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-3 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <span>{copy.totalInvested}: <span className="font-medium text-slate-700 dark:text-slate-200">{fmtCurrency(totalInvested)}</span></span>
          <span>{copy.totalCost}: <span className="font-medium text-slate-700 dark:text-slate-200">{fmtCurrency(totalCost)}</span></span>
          <span>{copy.currentBalance}: <span className={`font-medium ${currentBalance >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>{fmtCurrency(currentBalance)}</span></span>
          <span>{copy.projected}: <span className="font-medium text-slate-700 dark:text-slate-200">{fmtCurrency(projectedBalance)}</span></span>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="md" message={copy.loading} />
        </div>
      ) : investments.length === 0 ? (
        <div className="py-12 text-center">
          <Icons.Wallet className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
          <h3 className="mt-4 font-semibold text-slate-700 dark:text-slate-300">
            {copy.emptyTitle}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {copy.emptySubtitle}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {investments.map((inv) => {
            const contributorNames = getContributorNames(inv);
            const contributorCount = getContributorCount(inv);

            return (
              <div
                key={inv.id}
                className="flex items-start justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 transition hover:shadow-md dark:border-slate-700 dark:bg-slate-800/50 dark:hover:shadow-slate-900/20"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium text-slate-900 dark:text-white">
                      {inv.description || copy.investment}
                    </h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(inv.date).toLocaleDateString("nl-BE")}
                    </span>
                  </div>

                  {contributorNames.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {contributorNames.map((name) => (
                        <span
                          key={`${inv.id}-${name}`}
                          className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {name}
                        </span>
                      ))}
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                        {copy.splitAmong} {contributorCount + 1}
                      </span>
                    </div>
                  )}
                </div>

                <div className="ml-4 flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-lg font-bold text-brand-600 dark:text-brand-400">
                      {fmtCurrency(getYourShare(inv))}
                    </p>
                    {contributorCount > 0 && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {copy.total} {fmtCurrency(inv.amount)}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => handleStartEdit(inv)}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-brand-50 hover:text-brand-600 dark:text-slate-600 dark:hover:bg-brand-900/20"
                    title={copy.edit}
                  >
                    <Icons.Edit className="h-4 w-4" />
                  </button>

                  <button
                    onClick={() => handleDelete(inv.id)}
                    disabled={deleting === inv.id}
                    className="rounded-lg p-2 text-slate-500 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-slate-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    title={copy.delete}
                  >
                    <Icons.Trash className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
