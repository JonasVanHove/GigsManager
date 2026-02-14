"use client";

import { useState, useMemo, useEffect } from "react";
import type { Gig, GigFormData } from "@/types";
import { calculateGigFinancials, formatCurrency } from "@/lib/calculations";
import { useAuth } from "./AuthProvider";

interface BandMemberOption {
  id: string;
  name: string;
  bands?: string[];
}

interface GigFormProps {
  gig?: Gig | null;
  onSubmit: (data: GigFormData) => Promise<void>;
  onCancel: () => void;
  onDelete?: (gig: Gig) => void;
}

const emptyForm: GigFormData = {
  eventName: "",
  date: "",
  performers: "",
  numberOfMusicians: 1,
  performanceLineup: "",
  managerPerforms: true,
  isCharity: false,
  performanceFee: 0,
  technicalFee: 0,
  managerBonusType: "fixed",
  managerBonusAmount: 0,
  performanceDistribution: "equal",
  managerPerformanceAmount: null,
  claimPerformanceFee: true,
  claimTechnicalFee: true,
  technicalFeeClaimAmount: null,
  managerHandlesDistribution: true,
  advanceReceivedByManager: 0,
  advanceToMusicians: 0,
  paymentReceived: false,
  paymentReceivedDate: "",
  bandPaid: false,
  bandPaidDate: "",
  bookingDate: new Date().toISOString().split("T")[0],
  notes: "",
};

function gigToFormData(gig: Gig): GigFormData {
  return {
    eventName: gig.eventName,
    date: gig.date ? gig.date.split("T")[0] : "",
    performers: gig.performers,
    numberOfMusicians: gig.numberOfMusicians,
    performanceLineup: gig.performanceLineup ?? "",
    managerPerforms: gig.managerPerforms ?? true,
    isCharity: gig.isCharity ?? false,
    performanceFee: gig.performanceFee,
    technicalFee: gig.technicalFee,
    managerBonusType: gig.managerBonusType,
    managerBonusAmount: gig.managerBonusAmount,
    performanceDistribution: gig.performanceDistribution ?? "equal",
    managerPerformanceAmount: gig.managerPerformanceAmount ?? null,
    claimPerformanceFee: gig.claimPerformanceFee ?? true,
    claimTechnicalFee: gig.claimTechnicalFee ?? true,
    technicalFeeClaimAmount: gig.technicalFeeClaimAmount ?? null,
    managerHandlesDistribution: gig.managerHandlesDistribution ?? true,
    advanceReceivedByManager: gig.advanceReceivedByManager ?? 0,
    advanceToMusicians: gig.advanceToMusicians ?? 0,
    paymentReceived: gig.paymentReceived,
    paymentReceivedDate: gig.paymentReceivedDate
      ? gig.paymentReceivedDate.split("T")[0]
      : "",
    bandPaid: gig.bandPaid,
    bandPaidDate: gig.bandPaidDate ? gig.bandPaidDate.split("T")[0] : "",
    bookingDate: gig.bookingDate ? gig.bookingDate.split("T")[0] : "",
    notes: gig.notes ?? "",
  };
}

export default function GigForm({ gig, onSubmit, onCancel, onDelete }: GigFormProps) {
  const { getAccessToken, user } = useAuth();
  const [form, setForm] = useState<GigFormData>(
    gig ? gigToFormData(gig) : emptyForm
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bandMembers, setBandMembers] = useState<BandMemberOption[]>([]);
  const [bandMembersLoading, setBandMembersLoading] = useState(false);
  const [allGigs, setAllGigs] = useState<Gig[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [syncFromMembers, setSyncFromMembers] = useState(!gig);
  const [newMemberName, setNewMemberName] = useState("");
  const [savingMember, setSavingMember] = useState(false);
  const [customBands, setCustomBands] = useState<string[]>([]);
  const [selectedBandName, setSelectedBandName] = useState("");
  const [newBandName, setNewBandName] = useState("");

  const parseNames = (value: string) =>
    value
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

  // Live financial preview
  const calc = useMemo(
    () =>
      calculateGigFinancials(
        form.performanceFee,
        form.technicalFee,
        form.managerBonusType,
        form.managerBonusAmount,
        form.numberOfMusicians,
        form.claimPerformanceFee,
        form.claimTechnicalFee,
        form.technicalFeeClaimAmount,
        form.advanceReceivedByManager,
        form.advanceToMusicians,
        form.isCharity,
        form.performanceDistribution,
        form.managerPerformanceAmount
      ),
    [
      form.performanceFee,
      form.technicalFee,
      form.managerBonusType,
      form.managerBonusAmount,
      form.numberOfMusicians,
      form.claimPerformanceFee,
      form.claimTechnicalFee,
      form.technicalFeeClaimAmount,
      form.advanceReceivedByManager,
      form.advanceToMusicians,
      form.isCharity,
      form.performanceDistribution,
      form.managerPerformanceAmount,
    ]
  );

  const set = <K extends keyof GigFormData>(key: K, value: GigFormData[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // Auto-set performance fee to 0 when charity is checked
  useEffect(() => {
    if (form.isCharity && form.performanceFee > 0) {
      setForm((prev) => ({ ...prev, performanceFee: 0 }));
    }
  }, [form.isCharity]);

  // Auto-set payment dates to performance date when charity is checked
  useEffect(() => {
    if (form.isCharity && form.date) {
      setForm((prev) => ({
        ...prev,
        paymentReceived: true,
        paymentReceivedDate: form.date,
        bandPaid: true,
        bandPaidDate: form.date,
      }));
    }
  }, [form.isCharity, form.date]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      const confirmed = window.confirm("Discard this performance?");
      if (confirmed) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);
  const fetchBandMembers = async () => {
    try {
      setBandMembersLoading(true);
      const token = await getAccessToken();
      if (!token) return;
      const response = await fetch("/api/band-members", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      const options = Array.isArray(data)
        ? data.map((member) => ({
            id: member.id,
            name: member.name,
            bands: member.bands || [],
          }))
        : [];
      setBandMembers(options);
    } finally {
      setBandMembersLoading(false);
    }
  };

  const fetchAllGigs = async () => {
    const token = await getAccessToken();
    if (!token) return;
    const response = await fetch("/api/gigs?take=200&skip=0", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return;
    const data = await response.json();
    const gigsArray = Array.isArray(data) ? data : (data.data ?? []);
    setAllGigs(gigsArray);
  };

  useEffect(() => {
    fetchBandMembers();
    fetchAllGigs();
  }, []);

  useEffect(() => {
    if (!bandMembers.length || selectedMemberIds.length > 0) return;
    if (!form.performanceLineup) return;
    const names = parseNames(form.performanceLineup);
    if (!names.length) return;
    const matched = bandMembers
      .filter((member) => names.some((n) => n.toLowerCase() === member.name.toLowerCase()))
      .map((member) => member.id);
    if (matched.length) {
      setSelectedMemberIds(matched);
    }
  }, [bandMembers, form.performanceLineup, selectedMemberIds.length]);

  useEffect(() => {
    if (!syncFromMembers) return;
    const selected = bandMembers.filter((member) => selectedMemberIds.includes(member.id));
    const selectedNames = selected.map((member) => member.name);
    const existingNames = parseNames(form.performanceLineup);
    const selectedSet = new Set(selectedNames.map((name) => name.toLowerCase()));
    const extraNames = existingNames.filter(
      (name) => !selectedSet.has(name.toLowerCase())
    );
    const mergedNames = [...selectedNames, ...extraNames];
    const mergedLineup = mergedNames.join(", ");
    if (mergedLineup !== form.performanceLineup) {
      set("performanceLineup", mergedLineup);
    }
    const totalMusicians = Math.max(
      1,
      selectedNames.length + extraNames.length + (form.managerPerforms ? 1 : 0)
    );
    if (totalMusicians !== form.numberOfMusicians) {
      set("numberOfMusicians", totalMusicians);
    }
  }, [syncFromMembers, selectedMemberIds, bandMembers, form.performanceLineup, form.managerPerforms]);

  const filteredMembers = useMemo(() => {
    const search = memberSearch.trim().toLowerCase();
    if (!search) return bandMembers;
    return bandMembers.filter((member) => {
      const inName = member.name.toLowerCase().includes(search);
      const inBand = (member.bands || []).some((band) => band.toLowerCase().includes(search));
      return inName || inBand;
    });
  }, [bandMembers, memberSearch]);

  const bandOptions = useMemo(() => {
    const fromMembers = bandMembers.flatMap((member) => member.bands || []);
    const fromGigs = allGigs.map((gig) => gig.performers).filter((name) => name && name.trim());
    const set = new Set(
      [...fromMembers, ...fromGigs, ...customBands]
        .map((name) => name.trim())
        .filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [bandMembers, allGigs, customBands]);

  const getDefaultMemberIds = (band: string) => {
    const normalized = band.trim().toLowerCase();
    return bandMembers
      .filter((member) =>
        (member.bands || []).some((b) => b.trim().toLowerCase() === normalized)
      )
      .map((member) => member.id);
  };

  useEffect(() => {
    if (!form.performers) {
      setSelectedBandName("");
      return;
    }
    const exact = bandOptions.find(
      (band) => band.toLowerCase() === form.performers.trim().toLowerCase()
    );
    setSelectedBandName(exact || "");
  }, [form.performers, bandOptions]);

  useEffect(() => {
    if (!selectedBandName) return;
    if (!bandMembers.length) return;
    if (selectedMemberIds.length > 0) return;
    const defaults = getDefaultMemberIds(selectedBandName);
    if (defaults.length > 0) {
      setSelectedMemberIds(defaults);
      setSyncFromMembers(true);
    }
  }, [selectedBandName, bandMembers, selectedMemberIds.length]);

  const toggleMember = (id: string) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleAddMember = async () => {
    const name = newMemberName.trim();
    if (!name) return;
    try {
      setSavingMember(true);
      const token = await getAccessToken();
      if (!token) return;
      const response = await fetch("/api/band-members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (!response.ok) return;
      const member = await response.json();
      const option = { id: member.id, name: member.name, bands: member.bands || [] };
      setBandMembers((prev) => [...prev, option]);
      setSelectedMemberIds((prev) => [...prev, option.id]);
      setNewMemberName("");
      setSyncFromMembers(true);
    } finally {
      setSavingMember(false);
    }
  };

  const handleSelectBand = (band: string) => {
    setSelectedBandName(band);
    if (band) {
      set("performers", band);
      const defaults = getDefaultMemberIds(band);
      setSelectedMemberIds(defaults);
      setSyncFromMembers(true);
      setMemberSearch(band);
    } else {
      setMemberSearch("");
    }
  };

  const handleAddBand = () => {
    const name = newBandName.trim();
    if (!name) return;
    setCustomBands((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setNewBandName("");
    setSelectedBandName(name);
    set("performers", name);
    setSelectedMemberIds([]);
    setSyncFromMembers(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!form.eventName || !form.date || !form.performers) {
      setError("Please fill in all required fields.");
      return;
    }
    if (form.numberOfMusicians < 1) {
      setError("Number of musicians must be at least 1.");
      return;
    }

    setLoading(true);
    try {
      await onSubmit({
        ...form,
        bandMemberIds: selectedMemberIds,
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // -- Shared styles ----------------------------------------------------------
  const inputCls =
    "block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 disabled:opacity-50";
  const labelCls = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 px-4 py-10 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            {gig ? "Edit Performance" : "Add Performance"}
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {gig
              ? "Update the details of this gig."
              : "Enter the details for the new gig."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5">
          {error && (
            <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          )}

          {/* -- Event details ------------------------------------------- */}
          <fieldset className="mb-5">
            <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Event Details
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>
                  Event Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="e.g. Jazz at the Park"
                  value={form.eventName}
                  onChange={(e) => set("eventName", e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  className={inputCls}
                  value={form.date}
                  onChange={(e) => set("date", e.target.value)}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Booking Date</label>
                <input
                  type="date"
                  className={inputCls}
                  value={form.bookingDate}
                  onChange={(e) => set("bookingDate", e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  When the booking was made (default: today)
                </p>
              </div>
              <div>
                <label className={labelCls}>
                  Band / Artist <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="e.g. The Blue Notes"
                  value={form.performers}
                  onChange={(e) => set("performers", e.target.value)}
                  required
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  This is the band or artist name, not the member list.
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Performance line-up</label>
                <input
                  type="text"
                  className={inputCls}
                  placeholder="e.g. Alice, Bob, Chris"
                  value={form.performanceLineup}
                  onChange={(e) => set("performanceLineup", e.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Names who played in this performance. Use commas to separate.
                </p>
              </div>
              <div>
                <label className={labelCls}>Band / Artist</label>
                <select
                  className={inputCls}
                  value={selectedBandName}
                  onChange={(e) => handleSelectBand(e.target.value)}
                >
                  <option value="">Select a band</option>
                  {bandOptions.map((band) => (
                    <option key={band} value={band}>
                      {band}
                    </option>
                  ))}
                </select>
                <div className="mt-2 flex gap-2">
                  <input
                    type="text"
                    value={newBandName}
                    onChange={(e) => setNewBandName(e.target.value)}
                    placeholder="Add new band"
                    className={inputCls}
                  />
                  <button
                    type="button"
                    onClick={handleAddBand}
                    disabled={!newBandName.trim()}
                    className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-700 dark:hover:bg-slate-600"
                  >
                    Add
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Selecting a band fills the performers field.
                </p>
              </div>
              <div>
                <label className={labelCls}>
                  Number of Musicians <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  className={`${inputCls} [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                  style={{ MozAppearance: 'textfield' }}
                  value={form.numberOfMusicians || ""}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    if (val === "") {
                      set("numberOfMusicians", 0); // Allow empty to enable clearing
                    } else {
                      set("numberOfMusicians", Math.max(1, Number(val)));
                    }
                  }}
                  onBlur={(e) => {
                    if (!form.numberOfMusicians || form.numberOfMusicians < 1) {
                      set("numberOfMusicians", 1); // Default to 1 on blur if empty
                    }
                  }}
                  required
                />
                <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={form.managerPerforms}
                    onChange={(e) => set("managerPerforms", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  <span>I play in this performance</span>
                </div>
                {syncFromMembers && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Count auto-syncs from selected members + line-up names + me.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    Band members
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Select members to sync the line-up and musician count.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={syncFromMembers}
                    onChange={(e) => setSyncFromMembers(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                  />
                  Sync to fields
                </label>
              </div>

              <div className="mt-3">
                <input
                  type="text"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder="Search by name or band"
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </div>

              <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                {bandMembersLoading ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Loading band members...
                  </div>
                ) : filteredMembers.length === 0 ? (
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    No band members found.
                  </div>
                ) : (
                  filteredMembers.map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300"
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.includes(member.id)}
                          onChange={() => toggleMember(member.id)}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                        <span className="font-medium">{member.name}</span>
                      </div>
                      {member.bands && member.bands.length > 0 && (
                        <span className="text-xs text-slate-400">
                          {member.bands.join(", ")}
                        </span>
                      )}
                    </label>
                  ))
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  type="text"
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="Add new member"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleAddMember}
                  disabled={savingMember || !newMemberName.trim()}
                  className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-700 dark:hover:bg-slate-600"
                >
                  {savingMember ? "Adding..." : "Add & select"}
                </button>
              </div>
            </div>
          </fieldset>

          {/* -- Financials ---------------------------------------------- */}
          <fieldset className="mb-5">
            <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Financials
            </legend>

            {/* Charity checkbox */}
            <div className="mb-4 rounded-lg border border-purple-200 dark:border-purple-700/50 bg-purple-50 dark:bg-purple-950/30 p-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 focus:ring-purple-500 dark:focus:ring-purple-400"
                  checked={form.isCharity}
                  onChange={(e) => set("isCharity", e.target.checked)}
                />
                <span className="text-sm font-medium text-purple-900 dark:text-purple-300">
                  Charity / Pro Bono Performance
                </span>
              </label>
              <p className="mt-2 ml-6 text-xs text-purple-700 dark:text-purple-400">
                Check this if this is a free performance for a good cause. Compensation will be $0 and payment dates will automatically be set to the performance date.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls}>
                  Performance Fee ($) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputCls}
                  value={form.performanceFee === 0 ? "" : form.performanceFee}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || val === "-") {
                      set("performanceFee", 0);
                    } else {
                      set("performanceFee", Math.max(0, Number(val)));
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === "" || e.target.value === "-") {
                      set("performanceFee", 0);
                    }
                  }}
                  required
                />
              </div>
              <div>
                <label className={labelCls}>Technical Fee ($)</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputCls}
                  value={form.technicalFee === 0 ? "" : form.technicalFee}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || val === "-") {
                      set("technicalFee", 0);
                    } else {
                      set("technicalFee", Math.max(0, Number(val)));
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === "" || e.target.value === "-") {
                      set("technicalFee", 0);
                    }
                  }}
                />
              </div>
              <div>
                <label className={labelCls}>Manager Bonus Type</label>
                <select
                  className={inputCls}
                  value={form.managerBonusType}
                  onChange={(e) =>
                    set(
                      "managerBonusType",
                      e.target.value as "fixed" | "percentage"
                    )
                  }
                >
                  <option value="fixed">Fixed Amount ($)</option>
                  <option value="percentage">Percentage (%)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>
                  Bonus Amount{" "}
                  {form.managerBonusType === "percentage" ? "(%)" : "($)"}
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputCls}
                  value={form.managerBonusAmount === 0 ? "" : form.managerBonusAmount}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || val === "-") {
                      set("managerBonusAmount", 0);
                    } else {
                      set("managerBonusAmount", Math.max(0, Number(val)));
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === "" || e.target.value === "-") {
                      set("managerBonusAmount", 0);
                    }
                  }}
                />
              </div>
            </div>

            {/* Fee claims for this gig */}
            <div className="mt-4 space-y-3 rounded-lg border border-brand-200 dark:border-brand-700/50 bg-brand-50/40 dark:bg-brand-950/20 p-3">
              <div>
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 focus:ring-brand-500 dark:focus:ring-brand-400"
                    checked={form.claimPerformanceFee}
                    onChange={(e) => set("claimPerformanceFee", e.target.checked)}
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Claim performance fee
                  </span>
                </label>
                <p className="mt-1 ml-6 text-xs text-slate-500 dark:text-slate-400">
                  {form.claimPerformanceFee 
                    ? `Split among ${form.numberOfMusicians} musicians (your share: ${formatCurrency(form.performanceFee / form.numberOfMusicians)})`
                    : `Fee split among ${Math.max(1, form.numberOfMusicians - 1)} musicians only — you pay all of it to them`
                  }
                </p>
              </div>
              
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 focus:ring-brand-500 dark:focus:ring-brand-400"
                  checked={form.claimTechnicalFee}
                  onChange={(e) => {
                    set("claimTechnicalFee", e.target.checked);
                    if (e.target.checked && form.technicalFeeClaimAmount === null) {
                      set("technicalFeeClaimAmount", form.technicalFee);
                    }
                  }}
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Claim technical fee
                </span>
              </label>

              {/* Technical fee claim amount — only if claiming */}
              {form.claimTechnicalFee && form.technicalFee > 0 && (
                <div className="ml-6 mt-2 rounded border border-brand-300/50 dark:border-brand-700/50 bg-white dark:bg-slate-800 p-2">
                  <label className={labelCls}>
                    Amount to claim (default: all)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={form.technicalFee}
                    step="0.01"
                    className={inputCls}
                    value={form.technicalFeeClaimAmount === null || form.technicalFeeClaimAmount === form.technicalFee ? "" : form.technicalFeeClaimAmount}
                    placeholder={form.technicalFee.toString()}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "" || val === "-") {
                        set("technicalFeeClaimAmount", form.technicalFee);
                      } else {
                        set("technicalFeeClaimAmount", Math.max(0, Math.min(form.technicalFee, Number(val))));
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value === "" || e.target.value === "-") {
                        set("technicalFeeClaimAmount", form.technicalFee);
                      }
                    }}
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Leave blank to claim the full {formatCurrency(form.technicalFee)}
                  </p>
                </div>
              )}
            </div>

            {/* Live calculation preview */}
            <div className="mt-4 rounded-lg bg-brand-50/60 dark:bg-brand-950/20 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">
                Calculated Preview
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Total</span>
                  <p className="font-bold text-slate-900 dark:text-slate-100">
                    {formatCurrency(calc.totalReceived)}
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Per Musician</span>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">
                    {formatCurrency(calc.amountPerMusician)}
                  </p>
                </div>
                <div>
                  <span className="text-brand-600 dark:text-brand-400">My Earnings</span>
                  <p className="font-bold text-brand-700 dark:text-brand-300">
                    {formatCurrency(calc.myEarnings)}
                  </p>
                </div>
                <div>
                  <span className="text-amber-600 dark:text-amber-400">Owe Others</span>
                  <p className="font-semibold text-amber-700 dark:text-amber-300">
                    {formatCurrency(calc.amountOwedToOthers)}
                  </p>
                </div>
              </div>
              {/* Show advance breakdown if there's an advance */}
              {form.advanceReceivedByManager > 0 && (
                <div className="mt-3 pt-3 border-t border-brand-200 dark:border-brand-700/50">
                  <p className="mb-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                    Advance Payment Breakdown
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Already Received</span>
                      <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(calc.myEarningsAlreadyReceived)}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500 dark:text-slate-400">Still Owed to Me</span>
                      <p className="font-semibold text-orange-700 dark:text-orange-300">
                        {formatCurrency(calc.myEarningsStillOwed)}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </fieldset>

          {/* -- Payment status ------------------------------------------ */}
          <fieldset className="mb-5">
            <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Payment Status
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Client payment */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 dark:bg-slate-800/50">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 dark:text-brand-400 focus:ring-brand-500 dark:focus:ring-brand-400"
                    checked={form.paymentReceived}
                    onChange={(e) => {
                      set("paymentReceived", e.target.checked);
                      if (!e.target.checked) set("paymentReceivedDate", "");
                    }}
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Payment received from client
                  </span>
                </label>
                {form.paymentReceived && (
                  <div className="mt-2">
                    <label className={labelCls}>Date received</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={form.paymentReceivedDate}
                      onChange={(e) =>
                        set("paymentReceivedDate", e.target.value)
                      }
                    />
                  </div>
                )}
              </div>

              {/* Band payment */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 dark:bg-slate-800/50">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 dark:text-brand-400 focus:ring-brand-500 dark:focus:ring-brand-400"
                    checked={form.bandPaid}
                    onChange={(e) => {
                      set("bandPaid", e.target.checked);
                      if (!e.target.checked) set("bandPaidDate", "");
                    }}
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Band members paid
                  </span>
                </label>
                {form.bandPaid && (
                  <div className="mt-2">
                    <label className={labelCls}>Date paid</label>
                    <input
                      type="date"
                      className={inputCls}
                      value={form.bandPaidDate}
                      onChange={(e) => set("bandPaidDate", e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Manager handles distribution */}
              <div className="rounded-lg border border-cyan-200 dark:border-cyan-700/50 bg-cyan-50 dark:bg-cyan-950/30 p-3 sm:col-span-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-cyan-300 dark:border-cyan-700 text-cyan-600 dark:text-cyan-400 focus:ring-cyan-500 dark:focus:ring-cyan-400"
                    checked={form.managerHandlesDistribution}
                    onChange={(e) => set("managerHandlesDistribution", e.target.checked)}
                  />
                  <span className="text-sm font-medium text-cyan-900 dark:text-cyan-300">
                    I'm responsible for splitting fees to band members
                  </span>
                </label>
                <p className="mt-1.5 text-xs text-cyan-800 dark:text-cyan-400">
                  ✓ Checked: You handle payment distribution and owe band members their share<br />
                  ✗ Unchecked: Band members get paid directly (e.g., by the client)
                </p>
              </div>
            </div>
          </fieldset>

          {/* -- Advance Payments ---------------------------------------- */}
          <fieldset className="mb-5">
            <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">
              Advance Payments (Optional)
            </legend>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              Track advance payments. If left empty, amounts will be distributed evenly among musicians.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-950/30 p-3">
                <label className={labelCls}>
                  Advance Received from Client ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputCls}
                  placeholder="0.00"
                  value={form.advanceReceivedByManager === 0 ? "" : form.advanceReceivedByManager}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || val === "-") {
                      set("advanceReceivedByManager", 0);
                    } else {
                      set("advanceReceivedByManager", Math.max(0, Number(val)));
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === "" || e.target.value === "-") {
                      set("advanceReceivedByManager", 0);
                    }
                  }}
                />
                <p className="mt-2 text-xs text-green-700 dark:text-green-400">
                  Amount you already received as advance
                </p>
              </div>

              <div className="rounded-lg border border-orange-200 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-950/30 p-3">
                <label className={labelCls}>
                  Advance Paid to Musicians ($)
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputCls}
                  placeholder="0.00"
                  value={form.advanceToMusicians === 0 ? "" : form.advanceToMusicians}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "" || val === "-") {
                      set("advanceToMusicians", 0);
                    } else {
                      set("advanceToMusicians", Math.max(0, Number(val)));
                    }
                  }}
                  onBlur={(e) => {
                    if (e.target.value === "" || e.target.value === "-") {
                      set("advanceToMusicians", 0);
                    }
                  }}
                />
                <p className="mt-2 text-xs text-orange-700 dark:text-orange-400">
                  Amount you already paid to band members
                </p>
              </div>
            </div>
          </fieldset>

          {/* -- Notes --------------------------------------------------- */}
          <fieldset className="mb-6">
            <label className={labelCls}>Notes</label>
            <textarea
              rows={2}
              className={inputCls}
              placeholder="Any additional notes..."
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </fieldset>

          {/* -- Actions ------------------------------------------------- */}
          <div className="flex justify-between border-t border-slate-200 pt-4">
            {/* Delete button (only when editing) */}
            {gig && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(gig)}
                className="rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-slate-800 px-5 py-2 text-sm text-red-600 dark:text-red-400 transition hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                Delete Performance
              </button>
            )}
            <div className="flex gap-3 ml-auto">
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="rounded-lg border border-slate-300 px-5 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
              >
              {loading && (
                <svg
                  className="h-4 w-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              )}
              {gig ? "Save Changes" : "Add Performance"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
