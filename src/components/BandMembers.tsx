"use client";

import { useState, useEffect, useMemo } from "react";
import type { Gig } from "@/types";
import { calculateGigFinancials, formatDate } from "@/lib/calculations";
import { useAuth } from "./AuthProvider";

interface BandMemberGig {
  gigId: string;
  gigName: string;
  gigDate: string;
  earned: number;
  paid: number;
}

interface BandMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  bands: string[];
  updatedAt: string;
  totalEarned: number;
  totalPaid: number;
  totalOwed: number;
  gigsCount: number;
  gigs: BandMemberGig[];
}

interface BandMembersProps {
  fmtCurrency: (amount: number) => string;
  flash: (message: string, type?: "ok" | "err") => void;
}

export default function BandMembers({ fmtCurrency, flash }: BandMembersProps) {
  const { getAccessToken } = useAuth();
  const [members, setMembers] = useState<BandMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showGigPicker, setShowGigPicker] = useState(false);
  const [activeMember, setActiveMember] = useState<BandMember | null>(null);
  const [allGigs, setAllGigs] = useState<Gig[]>([]);
  const [gigsLoading, setGigsLoading] = useState(false);
  const [selectedGigIds, setSelectedGigIds] = useState<string[]>([]);
  const [savingGigs, setSavingGigs] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "band" | "updated">("updated");
  const [groupByBand, setGroupByBand] = useState(false);
  const [bandFilter, setBandFilter] = useState("");
  const [gigSearch, setGigSearch] = useState("");
  const [gigBandFilter, setGigBandFilter] = useState("");
  const [gigStartDate, setGigStartDate] = useState("");
  const [gigEndDate, setGigEndDate] = useState("");
  const [formBands, setFormBands] = useState<string[]>([]);
  const [newBandName, setNewBandName] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    notes: "",
  });

  // Fetch band members
  const fetchMembers = async () => {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");
      const response = await fetch("/api/band-members", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      setMembers(data);
    } catch (error) {
      flash("Failed to load band members", "err");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    if (showForm && allGigs.length === 0 && !gigsLoading) {
      fetchAllGigs();
    }
  }, [showForm, allGigs.length, gigsLoading]);


  const fetchAllGigs = async () => {
    try {
      setGigsLoading(true);
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");
      const response = await fetch("/api/gigs?take=200&skip=0", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error("Failed to fetch");
      const data = await response.json();
      const gigsArray = Array.isArray(data) ? data : (data.data ?? []);
      const sorted = [...gigsArray].sort(
        (a: Gig, b: Gig) => new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setAllGigs(sorted);
    } catch (error) {
      flash("Failed to load gigs", "err");
    } finally {
      setGigsLoading(false);
    }
  };

  const openGigPicker = async (member: BandMember) => {
    setActiveMember(member);
    setSelectedGigIds(member.gigs.map((g) => g.gigId));
    setShowGigPicker(true);
    if (allGigs.length === 0) {
      await fetchAllGigs();
    }
  };

  const closeGigPicker = () => {
    setShowGigPicker(false);
    setActiveMember(null);
    setSelectedGigIds([]);
    setGigSearch("");
    setGigBandFilter("");
    setGigStartDate("");
    setGigEndDate("");
  };

  const toggleGigSelection = (gigId: string) => {
    setSelectedGigIds((prev) =>
      prev.includes(gigId) ? prev.filter((id) => id !== gigId) : [...prev, gigId]
    );
  };

  const handleSaveGigs = async () => {
    if (!activeMember) return;
    try {
      setSavingGigs(true);
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");
      const response = await fetch(`/api/band-members/${activeMember.id}/gigs`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ gigIds: selectedGigIds }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update gigs");
      }

      flash("Gigs updated", "ok");
      closeGigPicker();
      fetchMembers();
    } catch (error: any) {
      flash(error.message || "Failed to update gigs", "err");
    } finally {
      setSavingGigs(false);
    }
  };

  const assignedGigsById = useMemo(() => {
    if (!activeMember) return new Map<string, BandMemberGig>();
    return new Map(activeMember.gigs.map((gig) => [gig.gigId, gig]));
  }, [activeMember]);

  const memberBandOptions = useMemo(() => {
    const set = new Set(
      members.flatMap((member) => member.bands || []).filter((name) => name && name.trim())
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [members]);

  const allBandOptions = useMemo(() => {
    const gigBands = allGigs.map((gig) => gig.performers).filter((name) => name && name.trim());
    const set = new Set([...(memberBandOptions || []), ...gigBands, ...(formBands || [])]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [memberBandOptions, formBands, allGigs]);

  const gigBandOptions = useMemo(() => {
    const set = new Set(
      allGigs.map((gig) => gig.performers).filter((name) => name && name.trim())
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allGigs]);

  const filteredGigs = useMemo(() => {
    const search = gigSearch.trim().toLowerCase();
    const band = gigBandFilter.trim().toLowerCase();
    const start = gigStartDate ? new Date(gigStartDate) : null;
    const end = gigEndDate ? new Date(gigEndDate) : null;

    return allGigs.filter((gig) => {
      const matchesSearch =
        !search ||
        gig.eventName.toLowerCase().includes(search) ||
        gig.performers.toLowerCase().includes(search);
      const matchesBand = !band || gig.performers.toLowerCase() === band;
      const gigDate = new Date(gig.date);
      const matchesStart = !start || gigDate >= start;
      const matchesEnd = !end || gigDate <= end;
      return matchesSearch && matchesBand && matchesStart && matchesEnd;
    });
  }, [allGigs, gigSearch, gigBandFilter, gigStartDate, gigEndDate]);

  const filteredMembers = useMemo(() => {
    const band = bandFilter.trim().toLowerCase();
    return members.filter((member) => {
      if (!band) return true;
      return member.bands?.some((name) => name.toLowerCase() === band);
    });
  }, [members, bandFilter]);

  const sortedMembers = useMemo(() => {
    const copy = [...filteredMembers];
    if (sortBy === "updated") {
      return copy.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    }
    if (sortBy === "band") {
      return copy.sort((a, b) => {
        const bandA = (a.bands?.[0] || "zzzz").toLowerCase();
        const bandB = (b.bands?.[0] || "zzzz").toLowerCase();
        if (bandA !== bandB) return bandA.localeCompare(bandB);
        return a.name.localeCompare(b.name);
      });
    }
    return copy.sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredMembers, sortBy]);

  const groupedMembers = useMemo(() => {
    if (!groupByBand) return null;
    const groups = new Map<string, BandMember[]>();
    const withBand = sortedMembers.filter((member) => member.bands?.length);
    const noBand = sortedMembers.filter((member) => !member.bands?.length);

    withBand.forEach((member) => {
      member.bands.forEach((band) => {
        const key = band || "No band";
        const list = groups.get(key) || [];
        list.push(member);
        groups.set(key, list);
      });
    });

    if (noBand.length) {
      groups.set("No band", noBand);
    }

    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [groupByBand, sortedMembers]);

  const getGigShare = (gig: Gig) => {
    const calc = calculateGigFinancials(
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
    return calc.amountPerMusician;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      flash("Name is required", "err");
      return;
    }

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");
      const url = editingId
        ? `/api/band-members/${editingId}`
        : "/api/band-members";
      const method = editingId ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { 
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          bands: formBands,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save");
      }

      flash(
        editingId ? "Band member updated" : "Band member added",
        "ok"
      );
      
      setShowForm(false);
      setEditingId(null);
      setFormData({ name: "", email: "", phone: "", notes: "" });
      setFormBands([]);
      setNewBandName("");
      fetchMembers();
    } catch (error: any) {
      flash(error.message || "Failed to save band member", "err");
    }
  };

  const handleEdit = (member: BandMember) => {
    setFormData({
      name: member.name,
      email: member.email || "",
      phone: member.phone || "",
      notes: member.notes || "",
    });
    setFormBands(member.bands || []);
    setEditingId(member.id);
    setShowForm(true);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete ${name}? This will remove them from all gigs.`)) return;

    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No auth token");
      const response = await fetch(`/api/band-members/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) throw new Error("Failed to delete");

      flash("Band member deleted", "ok");
      fetchMembers();
    } catch (error) {
      flash("Failed to delete band member", "err");
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData({ name: "", email: "", phone: "", notes: "" });
    setFormBands([]);
    setNewBandName("");
  };

  const handleAddMemberClick = () => {
    if (!showForm) {
      setEditingId(null);
      setFormData({ name: "", email: "", phone: "", notes: "" });
      setFormBands([]);
      setNewBandName("");
    }
    setShowForm(!showForm);
  };

  const toggleFormBand = (band: string) => {
    setFormBands((prev) =>
      prev.includes(band) ? prev.filter((item) => item !== band) : [...prev, band]
    );
  };

  const addNewBand = () => {
    const trimmed = newBandName.trim();
    if (!trimmed) return;
    if (!formBands.includes(trimmed)) {
      setFormBands((prev) => [...prev, trimmed]);
    }
    setNewBandName("");
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Band Members
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Manage your band members and track payments
          </p>
        </div>
        <button
          onClick={handleAddMemberClick}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Add Member
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <h3 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">
            {editingId ? "Edit Band Member" : "New Band Member"}
          </h3>
          
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Phone
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Bands
              </label>
              {allBandOptions.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {allBandOptions.map((band) => (
                    <label key={band} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={formBands.includes(band)}
                        onChange={() => toggleFormBand(band)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                      />
                      {band}
                    </label>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  No bands yet. Add one below.
                </p>
              )}
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newBandName}
                  onChange={(e) => setNewBandName(e.target.value)}
                  placeholder="Add new band"
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
                <button
                  type="button"
                  onClick={addNewBand}
                  className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  Add
                </button>
              </div>
              {formBands.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {formBands.map((band) => (
                    <button
                      key={band}
                      type="button"
                      onClick={() => toggleFormBand(band)}
                      className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 transition hover:bg-brand-100 dark:bg-brand-900/30 dark:text-brand-200"
                    >
                      {band}
                      <span aria-hidden="true">&times;</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Select existing bands or add new ones.
              </p>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={2}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              {editingId ? "Update" : "Add"} Member
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {members.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Filter by band
            </label>
            <select
              value={bandFilter}
              onChange={(event) => setBandFilter(event.target.value)}
              className="mt-1 block w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="">All bands</option>
              {memberBandOptions.map((band) => (
                <option key={band} value={band}>
                  {band}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Sort
            </label>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as "name" | "band" | "updated")}
              className="mt-1 block w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
            >
              <option value="updated">Recently updated</option>
              <option value="name">Name (A-Z)</option>
              <option value="band">Band (A-Z)</option>
            </select>
          </div>
          <div className="flex items-center gap-2 pb-1">
            <input
              id="group-by-band"
              type="checkbox"
              checked={groupByBand}
              onChange={(event) => setGroupByBand(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <label htmlFor="group-by-band" className="text-sm text-slate-700 dark:text-slate-300">
              Group by band
            </label>
          </div>
        </div>
      )}

      {/* Members List */}
      {members.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
          <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
            No band members yet
          </h3>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Add your first band member to start tracking payments
          </p>
        </div>
      ) : (
        <>
          {groupByBand && groupedMembers ? (
            <div className="space-y-6">
              {groupedMembers.map(([band, grouped]) => (
                <div key={band}>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    {band}
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {grouped.map((member) => (
                      <div
                        key={`${band}-${member.id}`}
                        className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-700/50 dark:bg-slate-800/50">
                          <div className="flex items-start justify-between">
                            <div className="min-w-0 flex-1">
                              <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-cyan-300">
                                {member.name}
                              </h3>
                              {member.email && (
                                <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                                  {member.email}
                                </p>
                              )}
                              {member.bands?.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {member.bands.map((bandName) => (
                                    <span key={bandName} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                      {bandName}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                            <div className="ml-2 flex gap-1">
                              <button
                                onClick={() => openGigPicker(member)}
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                                title="Assign gigs"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5m-7.5 3h7.5m-7.5 3h4.5m-7.5 3.75h9A2.25 2.25 0 0 0 16.5 18V5.25A2.25 2.25 0 0 0 14.25 3h-6A2.25 2.25 0 0 0 6 5.25V18A2.25 2.25 0 0 0 8.25 19.5Z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleEdit(member)}
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20"
                                title="Edit"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handleDelete(member.id, member.name)}
                                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                                title="Delete"
                              >
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 px-4 py-3">
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                Total Earned
                              </p>
                              <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
                                {fmtCurrency(member.totalEarned)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                Gigs
                              </p>
                              <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
                                {member.gigsCount}
                              </p>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900/20">
                              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                Received
                              </p>
                              <p className="mt-0.5 text-lg font-bold text-emerald-700 dark:text-emerald-300">
                                {fmtCurrency(member.totalPaid)}
                              </p>
                            </div>
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
                              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                Pending
                              </p>
                              <p className="mt-0.5 text-lg font-bold text-amber-700 dark:text-amber-300">
                                {fmtCurrency(member.totalOwed)}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : sortedMembers.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              No band members match the selected filters.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sortedMembers.map((member) => (
                <div
                  key={member.id}
                  className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-700/50 dark:bg-slate-800/50">
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-lg font-semibold text-slate-900 dark:text-cyan-300">
                          {member.name}
                        </h3>
                        {member.email && (
                          <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                            {member.email}
                          </p>
                        )}
                        {member.bands?.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {member.bands.map((bandName) => (
                              <span key={bandName} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {bandName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="ml-2 flex gap-1">
                        <button
                          onClick={() => openGigPicker(member)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
                          title="Assign gigs"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h7.5m-7.5 3h7.5m-7.5 3h4.5m-7.5 3.75h9A2.25 2.25 0 0 0 16.5 18V5.25A2.25 2.25 0 0 0 14.25 3h-6A2.25 2.25 0 0 0 6 5.25V18A2.25 2.25 0 0 0 8.25 19.5Z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleEdit(member)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-900/20"
                          title="Edit"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDelete(member.id, member.name)}
                          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                          title="Delete"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 px-4 py-3">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Total Earned
                        </p>
                        <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
                          {fmtCurrency(member.totalEarned)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
                          Gigs
                        </p>
                        <p className="mt-0.5 font-semibold text-slate-800 dark:text-slate-200">
                          {member.gigsCount}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-900/20">
                        <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          Received
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-emerald-700 dark:text-emerald-300">
                          {fmtCurrency(member.totalPaid)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-900/20">
                        <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                          Pending
                        </p>
                        <p className="mt-0.5 text-lg font-bold text-amber-700 dark:text-amber-300">
                          {fmtCurrency(member.totalOwed)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showGigPicker && activeMember && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10">
          <div className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Assign gigs for {activeMember.name}
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Select the performances this member should receive a share from.
                </p>
              </div>
              <button
                onClick={closeGigPicker}
                className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                title="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 py-4">
              <div className="mb-4 grid gap-3 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Search
                  </label>
                  <input
                    type="text"
                    value={gigSearch}
                    onChange={(event) => setGigSearch(event.target.value)}
                    placeholder="Event or artist"
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Artist
                  </label>
                  <select
                    value={gigBandFilter}
                    onChange={(event) => setGigBandFilter(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">All</option>
                    {gigBandOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Date range
                  </label>
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={gigStartDate}
                      onChange={(event) => setGigStartDate(event.target.value)}
                      className="block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                    <input
                      type="date"
                      value={gigEndDate}
                      onChange={(event) => setGigEndDate(event.target.value)}
                      className="block w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                    />
                  </div>
                </div>
              </div>
              {gigsLoading ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent"></div>
                </div>
              ) : allGigs.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                  No gigs yet. Add a performance first.
                </div>
              ) : filteredGigs.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
                  No gigs match these filters.
                </div>
              ) : (
                <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                  {filteredGigs.map((gig) => {
                    const isSelected = selectedGigIds.includes(gig.id);
                    const assigned = assignedGigsById.get(gig.id);
                    const share = getGigShare(gig);
                    const earned = gig.isCharity ? 0 : (assigned?.earned ?? share);
                    const receivedRaw = assigned?.paid ?? 0;
                    const paidDirectlyComplete = !gig.managerHandlesDistribution && gig.paymentReceived;
                    const received = gig.isCharity
                      ? 0
                      : (gig.bandPaid || paidDirectlyComplete
                          ? earned
                          : (gig.managerHandlesDistribution ? receivedRaw : 0));
                    const pending = gig.isCharity
                      ? 0
                      : ((gig.bandPaid || paidDirectlyComplete)
                          ? 0
                          : (gig.managerHandlesDistribution
                              ? Math.max(0, earned - receivedRaw)
                              : earned));

                    return (
                      <label
                        key={gig.id}
                        className={`flex items-start gap-3 rounded-lg border px-3 py-2 transition ${
                          isSelected
                            ? "border-brand-400 bg-brand-50/60 dark:border-brand-600 dark:bg-brand-900/20"
                            : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleGigSelection(gig.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                              {gig.eventName}
                            </p>
                            {gig.isCharity && (
                              <span className="inline-flex items-center rounded-full bg-pink-100 px-2 py-0.5 text-xs font-medium text-pink-700 dark:bg-pink-900/30 dark:text-pink-300">
                                Charity
                              </span>
                            )}
                            {!gig.managerHandlesDistribution && (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                Paid directly
                              </span>
                            )}
                            {gig.bandPaid && gig.managerHandlesDistribution && (
                              <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                Band paid
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {formatDate(gig.date)} • {gig.performers}
                          </p>
                        </div>
                        <div className="w-36 text-right text-xs text-slate-500 dark:text-slate-400">
                          <div className="flex items-center justify-between gap-2">
                            <span>Earned</span>
                            <span className="font-semibold text-slate-900 dark:text-slate-100">
                              {isSelected ? fmtCurrency(earned) : "--"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>Received</span>
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {isSelected ? fmtCurrency(received) : "--"}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span>Pending</span>
                            <span className="font-semibold text-orange-700 dark:text-orange-400">
                              {isSelected ? fmtCurrency(pending) : "--"}
                            </span>
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-700">
              <button
                type="button"
                onClick={closeGigPicker}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveGigs}
                disabled={savingGigs || gigsLoading}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {savingGigs ? "Saving..." : "Save gigs"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
