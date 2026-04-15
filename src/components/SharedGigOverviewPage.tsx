"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PublicSharedGig, ShareLinkVisibility } from "@/types";
import BandTag from "./BandTag";
import { formatDate, resolveLocale } from "@/lib/preferences";

interface SharePayload {
  token: string;
  title: string | null;
  expiresAt: string | null;
  visibility: ShareLinkVisibility;
  passwordRequired: boolean;
  gigs: PublicSharedGig[];
}

interface SharedGigOverviewPageProps {
  token: string;
}

const financialFieldLabels: Array<{
  key: keyof PublicSharedGig;
  label: string;
}> = [
  { key: "performanceFee", label: "Performance Fee" },
  { key: "perMusicianShare", label: "Per Musician" },
  { key: "managerEarnings", label: "Manager Earnings" },
  { key: "managerBonus", label: "Manager Bonus" },
  { key: "technicalFee", label: "Technical Fee" },
  { key: "totalCost", label: "Total Cost" },
];

function formatMoney(value: number | null) {
  if (value === null || Number.isNaN(value)) return null;
  return new Intl.NumberFormat(resolveLocale(), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

function isPastGigDate(value: string | null) {
  if (!value) return false;
  const gigDay = new Date(value);
  const today = new Date();
  gigDay.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return gigDay < today;
}

export default function SharedGigOverviewPage({ token }: SharedGigOverviewPageProps) {
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");
  const [expired, setExpired] = useState(false);
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [shareData, setShareData] = useState<SharePayload | null>(null);
  const [isUpcomingSectionOpen, setIsUpcomingSectionOpen] = useState(true);
  const [isPastSectionOpen, setIsPastSectionOpen] = useState(false);
  const [expandedGigKeys, setExpandedGigKeys] = useState<Set<string>>(new Set());

  const loadShareData = useCallback(async () => {
    try {
      setLoading(true);
      setGeneralError("");

      const res = await fetch(`/api/share-links/${token}`, {
        cache: "no-store",
      });

      if (res.status === 410) {
        setExpired(true);
        setShareData(null);
        return;
      }

      if (res.status === 401) {
        const data = await res.json();
        setPasswordRequired(Boolean(data.passwordRequired));
        setShareData(null);
        setExpired(false);
        return;
      }

      if (!res.ok) {
        throw new Error("Unable to load shared gigs");
      }

      const data = (await res.json()) as SharePayload;
      setShareData(data);
      setPasswordRequired(false);
      setExpired(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      setGeneralError(message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadShareData();
  }, [loadShareData]);

  const handleVerifyPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!password.trim()) {
      setPasswordError("Enter the password to continue.");
      return;
    }

    try {
      setVerifying(true);
      setPasswordError("");

      const res = await fetch(`/api/share-links/${token}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 429) {
          const retryAfter = Number(data.retryAfterSeconds || 0);
          setPasswordError(
            retryAfter > 0
              ? `Too many attempts. Retry in ${Math.ceil(retryAfter / 60)} min.`
              : "Too many attempts. Please retry later."
          );
          return;
        }

        setPasswordError(data.error || "Invalid password");
        return;
      }

      setPassword("");
      await loadShareData();
    } catch {
      setPasswordError("Failed to verify password");
    } finally {
      setVerifying(false);
    }
  };

  const hasFinancialData = useMemo(() => {
    if (!shareData) return false;
    return financialFieldLabels.some(({ key }) =>
      shareData.gigs.some((gig) => gig[key] !== null)
    );
  }, [shareData]);

  const preparedGigs = useMemo(() => {
    if (!shareData) return [];
    const sorted = [...shareData.gigs].sort((a, b) => {
      if (!a.gigDate && !b.gigDate) return 0;
      if (!a.gigDate) return 1;
      if (!b.gigDate) return -1;
      return new Date(a.gigDate).getTime() - new Date(b.gigDate).getTime();
    });

    return sorted.map((gig, index) => {
      const key = `${gig.gigDate || "undated"}-${gig.eventName || "event"}-${gig.performers || "performers"}-${index}`;
      const isPast = isPastGigDate(gig.gigDate);
      return { gig, key, isPast };
    });
  }, [shareData]);

  const upcomingGigs = useMemo(
    () => preparedGigs.filter((item) => !item.isPast),
    [preparedGigs]
  );

  const pastGigs = useMemo(
    () => preparedGigs.filter((item) => item.isPast),
    [preparedGigs]
  );

  useEffect(() => {
    const defaultExpanded = new Set(upcomingGigs.map((item) => item.key));
    setExpandedGigKeys(defaultExpanded);
  }, [shareData, upcomingGigs]);

  const expandAll = () => {
    setExpandedGigKeys(new Set(preparedGigs.map((item) => item.key)));
  };

  const collapseAll = () => {
    setExpandedGigKeys(new Set());
  };

  const expandSection = (section: "upcoming" | "past") => {
    const source = section === "upcoming" ? upcomingGigs : pastGigs;
    setExpandedGigKeys((prev) => {
      const next = new Set(prev);
      source.forEach((item) => next.add(item.key));
      return next;
    });
  };

  const collapseSection = (section: "upcoming" | "past") => {
    const source = section === "upcoming" ? upcomingGigs : pastGigs;
    setExpandedGigKeys((prev) => {
      const next = new Set(prev);
      source.forEach((item) => next.delete(item.key));
      return next;
    });
  };

  const toggleGig = (key: string) => {
    setExpandedGigKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white/80 p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-brand-300 border-t-brand-600" />
          <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Loading shared gigs...</p>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-center dark:border-amber-700/70 dark:bg-amber-950/30">
          <p className="text-lg font-semibold text-amber-800 dark:text-amber-300">⚠️ This link has expired.</p>
        </div>
      </div>
    );
  }

  if (passwordRequired) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900/80">
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Protected Share Link</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Enter password to view this gig overview.</p>

          <form onSubmit={handleVerifyPassword} className="mt-4 space-y-3">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              placeholder="Password"
              autoComplete="current-password"
            />
            {passwordError && (
              <p className="text-xs text-red-600 dark:text-red-400">{passwordError}</p>
            )}
            <button
              type="submit"
              disabled={verifying}
              className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-70"
            >
              {verifying ? "Verifying..." : "Unlock"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!shareData) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="rounded-2xl border border-red-300 bg-red-50 p-6 text-center dark:border-red-700/70 dark:bg-red-950/30">
          <p className="text-sm text-red-700 dark:text-red-300">
            {generalError || "Unable to load this link."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="mb-5 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/75 sm:p-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
          {shareData.title?.trim() || "Shared Gig Overview"}
        </h1>
        {shareData.expiresAt && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Expires: {formatDate(shareData.expiresAt)}
          </p>
        )}
      </header>

      {preparedGigs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900/75">
          <p className="text-sm text-slate-600 dark:text-slate-400">No gigs are currently shared.</p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-5">
          <div className="rounded-xl border border-slate-200 bg-white/90 p-3 dark:border-slate-700 dark:bg-slate-900/70 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                Viewing {preparedGigs.length} shared performance{preparedGigs.length === 1 ? "" : "s"}
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={expandAll}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={collapseAll}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Collapse all
                </button>
              </div>
            </div>
          </div>

          {upcomingGigs.length > 0 && (
            <section className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-700/50 dark:bg-emerald-950/20 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsUpcomingSectionOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 text-left"
                >
                  <span className={`text-sm font-semibold text-emerald-800 dark:text-emerald-300 ${isUpcomingSectionOpen ? "" : "opacity-90"}`}>
                    Upcoming Performances
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {upcomingGigs.length}
                  </span>
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => expandSection("upcoming")}
                    className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                  >
                    Expand section
                  </button>
                  <button
                    type="button"
                    onClick={() => collapseSection("upcoming")}
                    className="rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-medium text-emerald-800 transition hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                  >
                    Collapse section
                  </button>
                </div>
              </div>

              {isUpcomingSectionOpen && (
                <div className="space-y-3 sm:space-y-4">
                  {upcomingGigs.map(({ gig, key }) => {
                    const isExpanded = expandedGigKeys.has(key);
                    return (
                      <article
                        key={key}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 sm:p-5"
                      >
                        <button
                          type="button"
                          onClick={() => toggleGig(key)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <div className="min-w-0">
                            {gig.gigDate && (
                              <p className="text-base font-semibold text-slate-900 dark:text-white">
                                {formatDate(gig.gigDate)}
                              </p>
                            )}
                            {gig.eventName && (
                              <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{gig.eventName}</p>
                            )}
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            Upcoming
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="mt-3 space-y-2">
                            {gig.performers && (
                              <BandTag name={gig.performers} variant="soft" />
                            )}
                            {gig.bookingDate && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">Booked: {formatDate(gig.bookingDate)}</p>
                            )}
                            {gig.notes && (
                              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {gig.notes}
                              </p>
                            )}

                            {(gig.clientPaymentStatus || gig.bandPaymentStatus) && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {gig.clientPaymentStatus && (
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${gig.clientPaymentStatus === "received" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                                    Client: {gig.clientPaymentStatus === "received" ? "Received" : "Pending"}
                                  </span>
                                )}
                                {gig.bandPaymentStatus && (
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${gig.bandPaymentStatus === "paid" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                                    Band: {gig.bandPaymentStatus === "paid" ? "Paid" : "Pending"}
                                  </span>
                                )}
                              </div>
                            )}

                            {hasFinancialData && (
                              <div className="mt-2 grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
                                {financialFieldLabels.map(({ key: fieldKey, label }) => {
                                  const value = gig[fieldKey] as number | null;
                                  if (value === null) return null;
                                  return (
                                    <div
                                      key={fieldKey}
                                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                                    >
                                      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                                      <p className="font-medium text-slate-800 dark:text-slate-100">{formatMoney(value)}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {pastGigs.length > 0 && (
            <section className="rounded-2xl border border-slate-300 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/40 sm:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setIsPastSectionOpen((prev) => !prev)}
                  className="inline-flex items-center gap-2 text-left"
                >
                  <span className={`text-sm font-semibold text-slate-800 dark:text-slate-200 ${isPastSectionOpen ? "" : "opacity-90"}`}>
                    Past Performances
                  </span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                    {pastGigs.length}
                  </span>
                </button>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => expandSection("past")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Expand section
                  </button>
                  <button
                    type="button"
                    onClick={() => collapseSection("past")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Collapse section
                  </button>
                </div>
              </div>

              {isPastSectionOpen && (
                <div className="space-y-3 sm:space-y-4">
                  {pastGigs.map(({ gig, key }) => {
                    const isExpanded = expandedGigKeys.has(key);
                    return (
                      <article
                        key={key}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/80 sm:p-5"
                      >
                        <button
                          type="button"
                          onClick={() => toggleGig(key)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <div className="min-w-0">
                            {gig.gigDate && (
                              <p className="text-base font-semibold text-slate-900 dark:text-white">
                                {formatDate(gig.gigDate)}
                              </p>
                            )}
                            {gig.eventName && (
                              <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{gig.eventName}</p>
                            )}
                          </div>
                          <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                            Past
                          </span>
                        </button>

                        {isExpanded && (
                          <div className="mt-3 space-y-2">
                            {gig.performers && (
                              <BandTag name={gig.performers} variant="soft" />
                            )}
                            {gig.bookingDate && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">Booked: {formatDate(gig.bookingDate)}</p>
                            )}
                            {gig.notes && (
                              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {gig.notes}
                              </p>
                            )}

                            {(gig.clientPaymentStatus || gig.bandPaymentStatus) && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {gig.clientPaymentStatus && (
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${gig.clientPaymentStatus === "received" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                                    Client: {gig.clientPaymentStatus === "received" ? "Received" : "Pending"}
                                  </span>
                                )}
                                {gig.bandPaymentStatus && (
                                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${gig.bandPaymentStatus === "paid" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"}`}>
                                    Band: {gig.bandPaymentStatus === "paid" ? "Paid" : "Pending"}
                                  </span>
                                )}
                              </div>
                            )}

                            {hasFinancialData && (
                              <div className="mt-2 grid grid-cols-1 gap-2 pt-2 sm:grid-cols-2">
                                {financialFieldLabels.map(({ key: fieldKey, label }) => {
                                  const value = gig[fieldKey] as number | null;
                                  if (value === null) return null;
                                  return (
                                    <div
                                      key={fieldKey}
                                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                                    >
                                      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                                      <p className="font-medium text-slate-800 dark:text-slate-100">{formatMoney(value)}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
