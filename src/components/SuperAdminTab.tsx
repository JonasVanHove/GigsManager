"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "./AuthProvider";
import LoadingSpinner from "./LoadingSpinner";

const SuperAdminUserDetail = dynamic(() => import("./SuperAdminUserDetail"), { ssr: false });

interface SuperAdminUserRow {
  id: string;
  supabaseId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  superAdmin: boolean;
  createdAt: string;
  updatedAt: string;
  counts: {
    bandMembers: number;
    gigs: number;
    investments: number;
    setlists: number;
    songs: number;
  };
}

interface PlatformStats {
  totalUsers: number;
  totalBands: number;
  totalGigs: number;
  activeUsers: number;
  inactiveUsers: number;
  activeBands: number;
  inactiveBands: number;
  totalRevenue: number;
  totalRevenueReceived: number;
  totalRevenueOutstanding: number;
  totalRevenuePending: number;
}

interface DemoStats {
  present: boolean;
  email: string;
  gigs: number;
  bands: number;
  setlists: number;
  users: number;
  included: boolean;
  mode: "production" | "full-analysis";
}

export default function SuperAdminTab() {
  const { getAccessToken } = useAuth();
  const [users, setUsers] = useState<SuperAdminUserRow[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [demo, setDemo] = useState<DemoStats | null>(null);
  const [includeDemo, setIncludeDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState<SuperAdminUserRow | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;

  useEffect(() => {
    let mounted = true;

    const loadData = async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken) {
          throw new Error("Missing access token");
        }
        setToken(accessToken);

        const [usersResponse, statsResponse] = await Promise.all([
          fetch("/api/superadmin/users", {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
          fetch(`/api/superadmin/stats?includeDemo=${includeDemo ? "true" : "false"}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          }),
        ]);

        if (!usersResponse.ok || !statsResponse.ok) {
          const message = !usersResponse.ok ? await usersResponse.text() : await statsResponse.text();
          throw new Error(message || "Failed to load superadmin data");
        }

        const usersPayload = (await usersResponse.json()) as { users?: SuperAdminUserRow[] };
        const statsPayload = (await statsResponse.json()) as { stats?: PlatformStats; demo?: DemoStats };

        if (mounted) {
          setUsers(usersPayload.users || []);
          setStats(statsPayload.stats || null);
          setDemo(statsPayload.demo || null);
          setError("");
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load users");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadData();

    return () => {
      mounted = false;
    };
  }, [getAccessToken]);

  const filteredUsers = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return users;
    return users.filter((user) => {
      const haystack = [user.name, user.email, user.supabaseId].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(text);
    });
  }, [query, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const visibleUsers = filteredUsers.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query]);

  // Reloads the KPI numbers whenever the demo-data toggle is flipped.
  const toggleIncludeDemo = useCallback(() => {
    setLoading(true);
    setError("");
    setIncludeDemo((previous) => !previous);
  }, []);

  useEffect(() => {
    let active = true;

    const reloadStats = async () => {
      try {
        const accessToken = await getAccessToken();
        if (!accessToken || !active) return;
        const response = await fetch(`/api/superadmin/stats?includeDemo=${includeDemo ? "true" : "false"}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok || !active) return;
        const payload = (await response.json()) as { stats?: PlatformStats; demo?: DemoStats };
        if (!active) return;
        setStats(payload.stats || null);
        setDemo(payload.demo || null);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Failed to reload statistics");
      } finally {
        if (active) setLoading(false);
      }
    };

    void reloadStats();
    return () => {
      active = false;
    };
  }, [includeDemo, getAccessToken]);

  const currencyFormatter = new Intl.NumberFormat("nl-BE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });

  const statCards = [
    { label: "Total Users", value: stats?.totalUsers ?? users.length, accent: "from-cyan-500 to-blue-600" },
    { label: "Active Users", value: stats?.activeUsers ?? 0, accent: "from-emerald-500 to-teal-600" },
    { label: "Total Bands", value: stats?.totalBands ?? 0, accent: "from-violet-500 to-indigo-600" },
    { label: "Total Gigs", value: stats?.totalGigs ?? users.reduce((sum, user) => sum + user.counts.gigs, 0), accent: "from-amber-500 to-orange-600" },
    { label: "Platform Revenue", value: currencyFormatter.format(stats?.totalRevenue ?? 0), accent: "from-pink-500 to-rose-600" },
    { label: "Superadmins", value: users.filter((user) => user.superAdmin).length, accent: "from-slate-600 to-slate-800" },
  ];

  if (loading) {
    return (
      <div className="flex min-h-[280px] items-center justify-center py-20">
        <LoadingSpinner size="lg" message="Loading superadmin data..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
        Failed to load superadmin overview: {error}
      </div>
    );
  }

  return (
    <div className="space-y-6 p-1 md:p-2">
      <div className="rounded-3xl border border-slate-200/60 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-6 text-white shadow-2xl shadow-slate-900/15">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-cyan-300">Superadmin</p>
            <h2 className="mt-2 text-2xl font-bold md:text-3xl">Platform operations</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {includeDemo && (
              <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-200">
                Full Analysis Mode
              </span>
            )}
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200 backdrop-blur-sm">
              Live status: Healthy
            </div>
          </div>
        </div>
        <p className="mt-3 max-w-3xl text-sm text-slate-300">
          Monitor user activity, workspace health, and platform-wide performance from a single operational view.
        </p>

        {/* Demo-data switch: KPIs exclude the public demo account by default. */}
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">Include Demo Data</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {demo?.present
                ? `${demo.email}: ${demo.gigs} gigs · ${demo.bands} bands · ${demo.setlists} setlists. ${
                    includeDemo
                      ? "Currently counted in every KPI."
                      : "Currently excluded from every KPI."
                  }`
                : "No demo account found in the database."}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={includeDemo}
            onClick={toggleIncludeDemo}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition ${
              includeDemo
                ? "bg-amber-400 text-amber-950"
                : "bg-white/10 text-slate-200 hover:bg-white/20"
            }`}
          >
            <span
              className={`inline-block h-3 w-3 rounded-full ${
                includeDemo ? "bg-amber-950" : "bg-slate-400"
              }`}
            />
            {includeDemo ? "Demo data ON" : "Demo data OFF"}
          </button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {statCards.map((card) => (
          <div key={card.label} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className={`h-1.5 bg-gradient-to-r ${card.accent}`} />
            <div className="p-4 sm:p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">{card.label}</div>
              <div className="mt-3 text-2xl font-bold text-slate-900 dark:text-slate-50">{String(card.value)}</div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">User & workspace management</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Search and review account activity across the platform</p>
            </div>
            <div className="relative w-full max-w-xs">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search users..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-cyan-400 focus:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-950/60">
                  <tr>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">User</th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Status</th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Usage</th>
                    <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {visibleUsers.map((user) => (
                    <tr key={user.id} onClick={() => setSelectedUser(user)} className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/70">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-11 w-11 overflow-hidden rounded-full border border-slate-200 bg-slate-100 shadow-sm dark:border-slate-700 dark:bg-slate-700">
                            {user.avatarUrl ? (
                              <Image src={user.avatarUrl} alt={user.name || user.email} width={44} height={44} className="h-full w-full object-cover" unoptimized />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-semibold text-white">
                                {(user.name || user.email || "?").charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900 dark:text-slate-50">{user.name || "Unnamed user"}</div>
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm text-slate-500 dark:text-slate-400">{user.email}</span>
                              {user.email?.toLowerCase() === demo?.email?.toLowerCase() && (
                                <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                                  Demo
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${user.superAdmin ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"}`}>
                          {user.superAdmin ? "Superadmin" : "Member"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                        <div className="grid grid-cols-2 gap-2">
                          <span>Gigs {user.counts.gigs}</span>
                          <span>Bands {user.counts.bandMembers}</span>
                          <span>Sets {user.counts.setlists}</span>
                          <span>Inv. {user.counts.investments}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                        {new Date(user.updatedAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-3 md:hidden">
            {visibleUsers.map((user) => (
              <button key={user.id} onClick={() => setSelectedUser(user)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-left dark:border-slate-700 dark:bg-slate-800/70">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-full border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-700">
                    {user.avatarUrl ? (
                      <Image src={user.avatarUrl} alt={user.name || user.email} width={48} height={48} className="h-full w-full object-cover" unoptimized />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-cyan-500 to-blue-600 text-sm font-semibold text-white">
                        {(user.name || user.email || "?").charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate font-semibold text-slate-900 dark:text-slate-50">{user.name || "Unnamed user"}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${user.superAdmin ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300" : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"}`}>
                        {user.superAdmin ? "Admin" : "User"}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">{user.email}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Showing {filteredUsers.length === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredUsers.length)} of {filteredUsers.length}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">Prev</button>
              <span className="text-sm text-slate-600 dark:text-slate-300">Page {page}/{totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">Next</button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">System health</h3>
            <div className="mt-4 space-y-3">
              {[
                { label: "API status", value: "Healthy", tone: "green" },
                { label: "Database", value: "Healthy", tone: "green" },
                { label: "Auth", value: "Operational", tone: "blue" },
                { label: "Storage", value: "Stable", tone: "purple" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/80">
                  <span className="text-sm text-slate-600 dark:text-slate-300">{item.label}</span>
                  <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${item.tone === "green" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : item.tone === "blue" ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300" : "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300"}`}>
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-5">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Platform analytics</h3>
            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-1 flex justify-between text-sm text-slate-600 dark:text-slate-300">
                  <span>Active users</span>
                  <span>{stats?.activeUsers ?? 0}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500" style={{ width: `${stats && stats.totalUsers ? (stats.activeUsers / stats.totalUsers) * 100 : 0}%` }} />
                </div>
              </div>
              <div>
                <div className="mb-1 flex justify-between text-sm text-slate-600 dark:text-slate-300">
                  <span>Active bands</span>
                  <span>{stats?.activeBands ?? 0}</span>
                </div>
                <div className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-2.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${stats && stats.totalBands ? (stats.activeBands / stats.totalBands) * 100 : 0}%` }} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/80">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Inactive users</div>
                  <div className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-50">{stats?.inactiveUsers ?? 0}</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/80">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 dark:text-slate-400">Inactive bands</div>
                  <div className="mt-2 text-xl font-bold text-slate-900 dark:text-slate-50">{stats?.inactiveBands ?? 0}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {selectedUser && token && (
        <SuperAdminUserDetail
          userId={selectedUser.id}
          userName={selectedUser.name}
          userEmail={selectedUser.email}
          userAvatar={selectedUser.avatarUrl}
          token={token}
          onClose={() => setSelectedUser(null)}
        />
      )}
    </div>
  );
}