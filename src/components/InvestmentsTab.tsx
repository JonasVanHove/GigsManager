"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./AuthProvider";
import type { Investment, InvestmentFormData } from "@/types";
import LoadingSpinner from "./LoadingSpinner";

interface BandMemberOption {
  id: string;
  name: string;
}

interface InvestmentsTabProps {
  fmtCurrency: (amount: number) => string;
}

export default function InvestmentsTab({ fmtCurrency }: InvestmentsTabProps) {
  const { session, getAccessToken } = useAuth();
  const defaultForm = (): InvestmentFormData => ({
    amount: 0,
    sharedWithMusician: false,
    contributorIds: [],
    description: "",
    date: new Date().toISOString().split("T")[0],
  });
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [bandMembers, setBandMembers] = useState<BandMemberOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InvestmentFormData>(defaultForm());
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchInvestments = async () => {
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
  };

  const fetchBandMembers = async () => {
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

      if (!response.ok) return;

      const data = await response.json();
      setBandMembers(
        Array.isArray(data)
          ? data.map((member: { id: string; name: string }) => ({ id: member.id, name: member.name }))
          : []
      );
    } catch (error) {
      console.error("Fetch band members error:", error);
    }
  };

  useEffect(() => {
    fetchInvestments();
    fetchBandMembers();
  }, [session?.user]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
            Investments
          </h3>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Track expenses that reduce your net profit
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
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 9.75A3.75 3.75 0 0 1 6 6h12a3.75 3.75 0 0 1 3.75 3.75v5.25A3.75 3.75 0 0 1 18 18.75H6A3.75 3.75 0 0 1 2.25 15V9.75Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 9h12M7.5 13.5h2.25" />
          </svg>
          {showForm ? "Cancel" : "Add Investment"}
        </button>
      </div>

      {showForm && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 dark:border-slate-700 dark:bg-slate-900">
          <h4 className="mb-4 font-semibold text-slate-900 dark:text-white">
            {editingId ? "Edit Investment" : "Add Investment"}
          </h4>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Amount
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
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
                Description (optional)
              </label>
              <input
                type="text"
                className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-400/20"
                placeholder="e.g., New sound equipment"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Musicians sharing this investment
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    The total is split equally between you and everyone selected here.
                  </p>
                </div>
                {form.contributorIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, contributorIds: [], sharedWithMusician: false })}
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {bandMembers.length === 0 ? (
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    No band members found yet.
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
                  Split among {form.contributorIds.length + 1} people including you.
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Date
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
              {saving ? "Saving..." : editingId ? "Save Changes" : "Save Investment"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-50 to-brand-50/50 p-4 dark:border-slate-700 dark:from-brand-950/20 dark:to-transparent">
        <div className="text-center">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
            Total Invested (your share)
          </p>
          <p className="mt-1 text-2xl font-bold text-brand-600 dark:text-brand-400">
            {fmtCurrency(totalInvested)}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {fmtCurrency(totalCost)} total cost · {investments.length} {investments.length === 1 ? "investment" : "investments"}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner size="md" message="Loading investments..." />
        </div>
      ) : investments.length === 0 ? (
        <div className="py-12 text-center">
          <svg className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" strokeWidth={1} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 3.07-.879 4.242 0M9.75 17.25c0 .552-.448 1-1 1H5.625c-.552 0-1-.448-1-1m12.621-4.47c.409-.34.659-.934.659-1.591v-2.64c0-1.228-.841-2.265-1.964-2.565A6.521 6.521 0 0 0 12 2.25c-1.466 0-2.869.36-4.095 1.001C6.041 3.476 5.2 4.513 5.2 5.74v2.637c0 .657.25 1.251.659 1.591m0 0c.409.34 1.227.855 2.966 1.694C9.75 15.75 11.565 16.5 12 16.5c.435 0 2.25-.75 3.175-1.32 1.738-.839 2.557-1.354 2.966-1.694" />
          </svg>
          <h3 className="mt-4 font-semibold text-slate-700 dark:text-slate-300">
            No investments yet
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Add your first investment to track expenses
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
                      {inv.description || "Investment"}
                    </h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {new Date(inv.date).toLocaleDateString()}
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
                        Split among {contributorCount + 1}
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
                        total {fmtCurrency(inv.amount)}
                      </p>
                    )}
                  </div>

                  <button
                    onClick={() => handleStartEdit(inv)}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 dark:text-slate-600 dark:hover:bg-brand-900/20"
                    title="Edit investment"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                    </svg>
                  </button>

                  <button
                    onClick={() => handleDelete(inv.id)}
                    disabled={deleting === inv.id}
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-slate-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    title="Delete investment"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
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
