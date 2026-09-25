"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Icons } from "./Icons";
import type { Gig, GigFormData } from "@/types";
import { calculateGigFinancials, formatCurrency } from "@/lib/calculations";
import { useAuth } from "./AuthProvider";
import { PhotoAnnotationEditor } from "./PhotoAnnotationEditor";
import { useSettings } from "./SettingsProvider";
import { hasGigFormChanges } from "@/lib/gig-form-dirty-state";
import { useModalLock } from "@/hooks/useModalLock";

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

function getEmptyForm(): GigFormData {
  return {
    eventName: "",
    date: "",
    performers: "",
    numberOfMusicians: 1,
    performanceLineup: "",
    managerPerforms: true,
    isCharity: false,
    isTentative: false,
    performanceFee: 0,
    performanceFeeUnknown: false,
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
    managerInstantPayment: false,
    bandPaid: false,
    bandPaidDate: "",
    bookingDate: new Date().toISOString().split("T")[0],
    notes: "",
    bandId: null,
  };
}

function gigToFormData(gig: Gig): GigFormData {
  return {
    eventName: gig.eventName,
    date: gig.date ? gig.date.split("T")[0] : "",
    performers: gig.performers,
    numberOfMusicians: gig.numberOfMusicians,
    performanceLineup: gig.performanceLineup ?? "",
    managerPerforms: gig.managerPerforms ?? true,
    isCharity: gig.isCharity ?? false,
    isTentative: gig.isTentative ?? false,
    performanceFee: gig.performanceFee,
    performanceFeeUnknown: gig.performanceFeeUnknown ?? false,
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
    managerInstantPayment: gig.managerInstantPayment ?? false,
    bandPaid: gig.bandPaid,
    bandPaidDate: gig.bandPaidDate ? gig.bandPaidDate.split("T")[0] : "",
    bookingDate: gig.bookingDate ? gig.bookingDate.split("T")[0] : "",
    notes: gig.notes ?? "",
    bandId: gig.bandId ?? null,
  };
}

export default function GigForm({ gig, onSubmit, onCancel, onDelete }: GigFormProps) {
  const { getAccessToken, user } = useAuth();
  const { locale } = useSettings();
  const isDutch = locale.startsWith("nl");
  const [form, setForm] = useState<GigFormData>(() =>
    gig ? gigToFormData(gig) : getEmptyForm()
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [bandMembers, setBandMembers] = useState<BandMemberOption[]>([]);
  const [bandMembersLoading, setBandMembersLoading] = useState(false);
  const [allGigs, setAllGigs] = useState<Gig[]>([]);
  const [bandsList, setBandsList] = useState<Array<{ id: string; name: string; logoUrl?: string; color?: string | null }>>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [syncFromMembers, setSyncFromMembers] = useState(!gig);
  const [newMemberName, setNewMemberName] = useState("");
  const [savingMember, setSavingMember] = useState(false);
  const [customBands, setCustomBands] = useState<string[]>([]);
  const [selectedBandName, setSelectedBandName] = useState("");
  const [newBandName, setNewBandName] = useState("");
  const [showNotesEditor, setShowNotesEditor] = useState(false);
  const [concertMode, setConcertMode] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [showAdditionalInfo, setShowAdditionalInfo] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const initialFormRef = useRef<GigFormData>(gig ? gigToFormData(gig) : getEmptyForm());

  const isDirty = useMemo(
    () => hasGigFormChanges(initialFormRef.current, form, selectedMemberIds),
    [form, selectedMemberIds]
  );

  const setPerformanceMode = (nextConcertMode: boolean) => {
    setConcertMode(nextConcertMode);
    try {
      localStorage.setItem("defaultPerformanceMode", nextConcertMode ? "concert" : "rehearsal");
    } catch {}
  };

  useEffect(() => {
    try {
      const v = typeof window !== 'undefined' ? localStorage.getItem('defaultPerformanceMode') : null;
      if (v) setConcertMode(v === 'concert');
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateViewport = () => setIsMobileView(window.innerWidth < 768);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    if (!gig) return;
    initialFormRef.current = gigToFormData(gig);
  }, [gig]);

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

  // Validate individual fields
  const validateField = (field: string, value: any): string => {
    switch (field) {
      case "eventName":
        if (!value || !value.trim()) return "Event name is required";
        if (value.length < 3) return "Event name must be at least 3 characters";
        return "";
      case "date":
        if (!value) return "Date is required";
        const gigDate = new Date(value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        oneYearAgo.setHours(0, 0, 0, 0);
        if (gigDate < oneYearAgo) return "Date seems too far in the past";
        return "";
      case "performers":
        if (!value || !value.trim()) return "Performers are required";
        return "";
      case "numberOfMusicians":
        if (value < 1) return "Must be at least 1 musician";
        if (value > 100) return "That's a lot of musicians! Please verify.";
        return "";
      case "performanceFee":
        if (value < 0) return "Fee cannot be negative";
        if (value > 1000000) return "Fee seems unusually high";
        return "";
      case "technicalFee":
        if (value < 0) return "Fee cannot be negative";
        return "";
      default:
        return "";
    }
  };

  const handleBlur = (field: string, value: any) => {
    const errorMsg = validateField(field, value);
    setFieldErrors((prev) => ({ ...prev, [field]: errorMsg }));
  };

  // Auto-set performance fee to 0 when charity is checked
  useEffect(() => {
    if (form.isCharity && form.performanceFee > 0) {
      setForm((prev) => ({ ...prev, performanceFee: 0, performanceFeeUnknown: false }));
    }
  }, [form.isCharity, form.performanceFee]);

  useEffect(() => {
    if (form.performanceFeeUnknown && form.performanceFee !== 0) {
      setForm((prev) => ({ ...prev, performanceFee: 0 }));
    }
  }, [form.performanceFeeUnknown, form.performanceFee]);

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

  const fetchBandMembers = useCallback(async () => {
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
  }, [getAccessToken]);

  const fetchAllGigs = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const response = await fetch("/api/gigs?take=200&skip=0", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      const gigsArray = Array.isArray(data) ? data : (data.data ?? []);
      setAllGigs(gigsArray);
    } catch (err) {
      console.error("Failed to fetch gigs:", err);
    }
  }, [getAccessToken]);

  const fetchBands = useCallback(async () => {
    try {
      const token = await getAccessToken();
      if (!token) return;
      const response = await fetch("/api/bands", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = await response.json();
      setBandsList(data || []);
    } catch (err) {
      console.error("Failed to fetch bands:", err);
    }
  }, [getAccessToken]);

  useEffect(() => {
    fetchBandMembers();
    fetchAllGigs();
    fetchBands();
  }, [fetchBandMembers, fetchAllGigs, fetchBands]);

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
  }, [syncFromMembers, selectedMemberIds, bandMembers, form.performanceLineup, form.managerPerforms, form.numberOfMusicians]);

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

  const getDefaultMemberIds = useCallback((band: string) => {
    const normalized = band.trim().toLowerCase();
    return bandMembers
      .filter((member) =>
        (member.bands || []).some((b) => b.trim().toLowerCase() === normalized)
      )
      .map((member) => member.id);
  }, [bandMembers]);

  useEffect(() => {
    if (!form.performers) {
      setSelectedBandName("");
      set("bandId", null);
      return;
    }
    const exact = bandOptions.find(
      (band) => band.toLowerCase() === form.performers.trim().toLowerCase()
    );
    setSelectedBandName(exact || "");
    
    // Auto-match bandId if performers name matches a band
    const matchedBand = bandsList.find(
      (band) => band.name.toLowerCase() === form.performers.trim().toLowerCase()
    );
    if (matchedBand) {
      set("bandId", matchedBand.id);
    } else {
      set("bandId", null);
    }
  }, [form.performers, bandOptions, bandsList]);

  useEffect(() => {
    if (!selectedBandName) return;
    if (!bandMembers.length) return;
    if (selectedMemberIds.length > 0) return;
    const defaults = getDefaultMemberIds(selectedBandName);
    if (defaults.length > 0) {
      setSelectedMemberIds(defaults);
      setSyncFromMembers(true);
    }
  }, [selectedBandName, bandMembers, selectedMemberIds.length, getDefaultMemberIds]);

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
      
      // Also set bandId if this band exists in bandsList
      const matchedBand = bandsList.find(
        (b) => b.name.toLowerCase() === band.toLowerCase()
      );
      if (matchedBand) {
        set("bandId", matchedBand.id);
      }
    } else {
      setMemberSearch("");
      set("bandId", null);
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

  const handleCancelAction = useCallback(() => {
    if (isDirty && !window.confirm("Discard unsaved changes?")) {
      return;
    }
    onCancel();
  }, [isDirty, onCancel]);

  const { handleBackdropClick } = useModalLock({
    onClose: handleCancelAction,
  });

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleCancelAction();
    };

    const handlePopState = () => {
      handleCancelAction();
      window.history.pushState(null, "", window.location.href);
    };

    window.history.pushState(null, "", window.location.href);
    window.addEventListener("keydown", handleEscapeKey);
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("keydown", handleEscapeKey);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [handleCancelAction]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch || touch.clientX > 32) {
      touchStartRef.current = null;
      return;
    }
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;
    const touch = event.changedTouches[0];
    if (!touch) {
      touchStartRef.current = null;
      return;
    }

    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    if (deltaX < -80 && Math.abs(deltaY) < 100) {
      handleCancelAction();
    }
    touchStartRef.current = null;
  };

  // -- Shared styles ----------------------------------------------------------
  const inputCls =
    "block w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20 disabled:opacity-50";
  const labelCls = "mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400";

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 sm:items-start sm:px-4 sm:py-10 backdrop-blur-md modal-backdrop-enter"
        onClick={handleBackdropClick}
      >
        <div
          className="modal-sheet-mobile flex max-h-[100dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:max-h-none sm:rounded-2xl modal-content-enter"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 sm:px-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {gig ? "Edit Performance" : "Add Performance"}
                </h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {gig ? "Update the details of this gig." : "Enter the details for the new gig."}
                </p>
              </div>
              {isDirty && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-300">
                  Unsaved
                </span>
              )}
            </div>
          </div>

          <form id="gig-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-950/30 px-4 py-2.5 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <fieldset className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/30">
              <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">General Details</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Event Name <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    className={`${inputCls} ${fieldErrors.eventName ? "border-red-500 dark:border-red-400 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500/20 dark:focus:ring-red-400/20" : ""}`}
                    placeholder="e.g. Jazz at the Park"
                    value={form.eventName}
                    onChange={(e) => { set("eventName", e.target.value); if (fieldErrors.eventName) setFieldErrors((prev) => ({ ...prev, eventName: "" })); }}
                    onBlur={(e) => handleBlur("eventName", e.target.value)}
                    required
                  />
                  {fieldErrors.eventName && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.eventName}</p>}
                </div>

                <div>
                  <label className={labelCls}>Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    className={`${inputCls} ${fieldErrors.date ? "border-red-500 dark:border-red-400 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500/20 dark:focus:ring-red-400/20" : ""}`}
                    value={form.date}
                    onChange={(e) => { set("date", e.target.value); if (fieldErrors.date) setFieldErrors((prev) => ({ ...prev, date: "" })); }}
                    onBlur={(e) => handleBlur("date", e.target.value)}
                    required
                  />
                  {fieldErrors.date && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.date}</p>}
                </div>

                <div>
                  <label className={labelCls}>Booking Date</label>
                  <label className="mb-2 flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 focus:ring-amber-500 dark:focus:ring-amber-400"
                      checked={form.isTentative}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        set("isTentative", checked);
                        if (checked) set("bookingDate", "");
                        else if (!form.bookingDate) set("bookingDate", new Date().toISOString().split("T")[0]);
                      }}
                    />
                    Tentative performance (not confirmed yet)
                  </label>
                  <input
                    type="date"
                    className={inputCls}
                    value={form.bookingDate}
                    onChange={(e) => set("bookingDate", e.target.value)}
                    disabled={form.isTentative}
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {form.isTentative ? "Booking date is not finalized yet for this performance." : "When the booking was made (default: today)"}
                  </p>
                </div>

                <div className="sm:col-span-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 dark:border-slate-700 dark:bg-slate-800/30">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <label className={labelCls}>Band / Artist <span className="text-red-500">*</span></label>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Pick an existing band first, or add a new one and use it immediately.</p>
                    </div>
                    <div className="min-w-[180px] text-right text-xs text-slate-400 dark:text-slate-500">
                      {bandOptions.length > 0 ? `${bandOptions.length} saved band${bandOptions.length !== 1 ? "s" : ""} available` : "No saved bands yet"}
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className={labelCls}>Select Band (optional)</label>
                    <select className={inputCls} value={form.bandId || ""} onChange={(e) => set("bandId", e.target.value || null)}>
                      <option value="">No band selected</option>
                      {bandsList.map((band) => <option key={band.id} value={band.id}>{band.name}</option>)}
                    </select>
                  </div>

                  <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
                    <select className={inputCls} value={selectedBandName} onChange={(e) => handleSelectBand(e.target.value)}>
                      <option value="">Choose an existing band name</option>
                      {bandOptions.map((band) => <option key={band} value={band}>{band}</option>)}
                    </select>
                    <div className="flex gap-2 lg:min-w-[320px]">
                      <input type="text" value={newBandName} onChange={(e) => setNewBandName(e.target.value)} placeholder="Add new band" className={inputCls} />
                      <button type="button" onClick={handleAddBand} disabled={!newBandName.trim()} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-700 dark:hover:bg-slate-600">Add</button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <label className={labelCls}>Band / Artist name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      className={`${inputCls} ${fieldErrors.performers ? "border-red-500 dark:border-red-400 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500/20 dark:focus:ring-red-400/20" : ""}`}
                      placeholder="e.g. The Blue Notes"
                      value={form.performers}
                      onChange={(e) => { set("performers", e.target.value); if (fieldErrors.performers) setFieldErrors((prev) => ({ ...prev, performers: "" })); }}
                      onBlur={(e) => handleBlur("performers", e.target.value)}
                      required
                    />
                    {fieldErrors.performers && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.performers}</p>}
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className={labelCls}>Performance line-up</label>
                  <input type="text" className={inputCls} placeholder="e.g. Alice, Bob, Chris" value={form.performanceLineup} onChange={(e) => set("performanceLineup", e.target.value)} />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Names who played in this performance. Use commas to separate.</p>
                </div>

                <div>
                  <label className={labelCls}>Number of Musicians <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min={1}
                    className={`${inputCls} [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${fieldErrors.numberOfMusicians ? "border-red-500 dark:border-red-400 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500/20 dark:focus:ring-red-400/20" : ""}`}
                    style={{ MozAppearance: "textfield" }}
                    value={form.numberOfMusicians || ""}
                    onChange={(e) => { const val = e.target.value.trim(); set("numberOfMusicians", val === "" ? 0 : Math.max(1, Number(val))); if (fieldErrors.numberOfMusicians) setFieldErrors((prev) => ({ ...prev, numberOfMusicians: "" })); }}
                    onBlur={(e) => { const val = Math.max(1, Number(e.target.value) || 1); set("numberOfMusicians", val); handleBlur("numberOfMusicians", val); }}
                    required
                  />
                  {fieldErrors.numberOfMusicians && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.numberOfMusicians}</p>}
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <input type="checkbox" checked={form.managerPerforms} onChange={(e) => set("managerPerforms", e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    <span>I play in this performance</span>
                  </div>
                  {syncFromMembers && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Count auto-syncs from selected members + line-up names + me.</p>}
                </div>
              </div>

              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Band members</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Select members to sync the line-up and musician count.</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={syncFromMembers} onChange={(e) => setSyncFromMembers(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                    Sync to fields
                  </label>
                </div>

                <div className="mt-3">
                  <input type="text" value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder="Search by name or band" className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                </div>

                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto pr-1">
                  {bandMembersLoading ? <div className="text-xs text-slate-500 dark:text-slate-400">Loading band members...</div> : filteredMembers.length === 0 ? <div className="text-xs text-slate-500 dark:text-slate-400">No band members found.</div> : filteredMembers.map((member) => (
                    <label key={member.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={selectedMemberIds.includes(member.id)} onChange={() => toggleMember(member.id)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                        <span className="font-medium">{member.name}</span>
                      </div>
                      {member.bands && member.bands.length > 0 && <span className="text-xs text-slate-400">{member.bands.join(", ")}</span>}
                    </label>
                  ))}
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <input type="text" value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="Add new member" className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white" />
                  <button type="button" onClick={handleAddMember} disabled={savingMember || !newMemberName.trim()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-700 dark:hover:bg-slate-600">{savingMember ? "Adding..." : "Add & select"}</button>
                </div>
              </div>
            </fieldset>

            <fieldset className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/30">
              <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Date & Time</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Date <span className="text-red-500">*</span></label>
                  <input type="date" className={`${inputCls} ${fieldErrors.date ? "border-red-500 dark:border-red-400 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500/20 dark:focus:ring-red-400/20" : ""}`} value={form.date} onChange={(e) => { set("date", e.target.value); if (fieldErrors.date) setFieldErrors((prev) => ({ ...prev, date: "" })); }} onBlur={(e) => handleBlur("date", e.target.value)} required />
                  {fieldErrors.date && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.date}</p>}
                </div>
                <div>
                  <label className={labelCls}>Booking Date</label>
                  <input type="date" className={inputCls} value={form.bookingDate} onChange={(e) => set("bookingDate", e.target.value)} disabled={form.isTentative} />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{form.isTentative ? "Booking date is not finalized yet for this performance." : "When the booking was made"}</p>
                </div>
              </div>
            </fieldset>

            <fieldset className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/30">
              <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Venue & Performance</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Performance line-up</label>
                  <input type="text" className={inputCls} placeholder="e.g. Alice, Bob, Chris" value={form.performanceLineup} onChange={(e) => set("performanceLineup", e.target.value)} />
                </div>
                <div>
                  <label className={labelCls}>Number of Musicians <span className="text-red-500">*</span></label>
                  <input type="number" min={1} className={`${inputCls} [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${fieldErrors.numberOfMusicians ? "border-red-500 dark:border-red-400 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500/20 dark:focus:ring-red-400/20" : ""}`} style={{ MozAppearance: "textfield" }} value={form.numberOfMusicians || ""} onChange={(e) => { const val = e.target.value.trim(); set("numberOfMusicians", val === "" ? 0 : Math.max(1, Number(val))); if (fieldErrors.numberOfMusicians) setFieldErrors((prev) => ({ ...prev, numberOfMusicians: "" })); }} onBlur={(e) => { const val = Math.max(1, Number(e.target.value) || 1); set("numberOfMusicians", val); handleBlur("numberOfMusicians", val); }} required />
                  {fieldErrors.numberOfMusicians && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.numberOfMusicians}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Venue / Location</label>
                  <input type="text" className={inputCls} placeholder="City, venue, or address" value={form.performers} onChange={(e) => set("performers", e.target.value)} />
                </div>
              </div>
            </fieldset>

            <fieldset className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/30">
              <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Financials & Payouts</legend>

              <div className="mb-4 rounded-lg border border-purple-200 dark:border-purple-700/50 bg-purple-50 dark:bg-purple-950/30 p-3">
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 rounded border-purple-300 dark:border-purple-700 text-purple-600 dark:text-purple-400 focus:ring-purple-500 dark:focus:ring-purple-400" checked={form.isCharity} onChange={(e) => set("isCharity", e.target.checked)} />
                  <span className="text-sm font-medium text-purple-900 dark:text-purple-300">Charity / Pro Bono Performance</span>
                </label>
                <p className="mt-2 ml-6 text-xs text-purple-700 dark:text-purple-400">Check this if this is a free performance for a good cause. Compensation will be $0 and payment dates will automatically be set to the performance date.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelCls}>Performance Fee ($) <span className="text-red-500">*</span></label>
                  <label className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-400">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 focus:ring-brand-500" checked={form.performanceFeeUnknown} onChange={(e) => { const checked = e.target.checked; set("performanceFeeUnknown", checked); if (checked) set("performanceFee", 0); }} disabled={form.isCharity} />
                    I don't know yet (temporarily unknown)
                  </label>
                  <input type="number" min={0} step="0.01" className={`${inputCls} ${fieldErrors.performanceFee ? "border-red-500 dark:border-red-400 focus:border-red-500 dark:focus:border-red-400 focus:ring-red-500/20 dark:focus:ring-red-400/20" : ""}`} value={form.performanceFee} onChange={(e) => { const val = e.target.value; set("performanceFee", val === "" || val === "-" ? 0 : Math.max(0, Number(val))); if (fieldErrors.performanceFee) setFieldErrors((prev) => ({ ...prev, performanceFee: "" })); }} onBlur={(e) => { const val = e.target.value === "" || e.target.value === "-" ? 0 : Number(e.target.value); set("performanceFee", Math.max(0, val)); handleBlur("performanceFee", val); }} disabled={form.performanceFeeUnknown || form.isCharity} required />
                  {form.performanceFeeUnknown && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Fee is temporarily set to $0 until you know the exact amount.</p>}
                  {fieldErrors.performanceFee && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{fieldErrors.performanceFee}</p>}
                </div>
                <div>
                  <label className={labelCls}>Technical Fee ($)</label>
                  <input type="number" min={0} step="0.01" className={inputCls} value={form.technicalFee === 0 ? "" : form.technicalFee} onChange={(e) => { const val = e.target.value; set("technicalFee", val === "" || val === "-" ? 0 : Math.max(0, Number(val))); }} onBlur={(e) => { if (e.target.value === "" || e.target.value === "-") set("technicalFee", 0); }} />
                </div>
                <div>
                  <label className={labelCls}>Manager Bonus Type</label>
                  <select className={inputCls} value={form.managerBonusType} onChange={(e) => set("managerBonusType", e.target.value as "fixed" | "percentage")}>
                    <option value="fixed">Fixed Amount ($)</option>
                    <option value="percentage">Percentage (%)</option>
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Bonus Amount {form.managerBonusType === "percentage" ? "(%)" : "($)"}</label>
                  <input type="number" min={0} step="0.01" className={inputCls} value={form.managerBonusAmount === 0 ? "" : form.managerBonusAmount} onChange={(e) => { const val = e.target.value; set("managerBonusAmount", val === "" || val === "-" ? 0 : Math.max(0, Number(val))); }} onBlur={(e) => { if (e.target.value === "" || e.target.value === "-") set("managerBonusAmount", 0); }} />
                </div>
              </div>

              <div className="mt-4 space-y-3 rounded-lg border border-brand-200 dark:border-brand-700/50 bg-brand-50/40 dark:bg-brand-950/20 p-3">
                <div>
                  <label className="flex items-center gap-2.5">
                    <input type="checkbox" className="h-4 w-4 rounded border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 focus:ring-brand-500 dark:focus:ring-brand-400" checked={form.claimPerformanceFee} onChange={(e) => set("claimPerformanceFee", e.target.checked)} />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Claim performance fee</span>
                  </label>
                  <p className="mt-1 ml-6 text-xs text-slate-500 dark:text-slate-400">{form.claimPerformanceFee ? `Split among ${form.numberOfMusicians} musicians (your share: ${formatCurrency(form.performanceFee / form.numberOfMusicians)})` : `Fee split among ${Math.max(1, form.numberOfMusicians - 1)} musicians only — you pay all of it to them`}</p>
                </div>

                <label className="flex items-center gap-2.5">
                  <input type="checkbox" className="h-4 w-4 rounded border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 focus:ring-brand-500 dark:focus:ring-brand-400" checked={form.claimTechnicalFee} onChange={(e) => { set("claimTechnicalFee", e.target.checked); if (e.target.checked && form.technicalFeeClaimAmount === null) set("technicalFeeClaimAmount", form.technicalFee); }} />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Claim technical fee</span>
                </label>

                {form.claimTechnicalFee && form.technicalFee > 0 && (
                  <div className="ml-6 mt-2 rounded border border-brand-300/50 dark:border-brand-700/50 bg-white dark:bg-slate-800 p-2">
                    <label className={labelCls}>Amount to claim (default: all)</label>
                    <input type="number" min={0} max={form.technicalFee} step="0.01" className={inputCls} value={form.technicalFeeClaimAmount === null || form.technicalFeeClaimAmount === form.technicalFee ? "" : form.technicalFeeClaimAmount} placeholder={form.technicalFee.toString()} onChange={(e) => { const val = e.target.value; set("technicalFeeClaimAmount", val === "" || val === "-" ? form.technicalFee : Math.max(0, Math.min(form.technicalFee, Number(val)))); }} onBlur={(e) => { if (e.target.value === "" || e.target.value === "-") set("technicalFeeClaimAmount", form.technicalFee); }} />
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Leave blank to claim the full {formatCurrency(form.technicalFee)}</p>
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-lg bg-brand-50/60 dark:bg-brand-950/20 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand-600 dark:text-brand-400">Calculated Preview</p>
                <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2 md:grid-cols-4">
                  <div><span className="text-slate-500 dark:text-slate-400">Total</span><p className="font-bold text-slate-900 dark:text-slate-100">{formatCurrency(calc.totalReceived)}</p></div>
                  <div><span className="text-slate-500 dark:text-slate-400">Per Musician</span><p className="font-semibold text-slate-700 dark:text-slate-300">{formatCurrency(calc.amountPerMusician)}</p></div>
                  <div><span className="text-brand-600 dark:text-brand-400">My Earnings</span><p className="font-bold text-brand-700 dark:text-brand-300">{formatCurrency(calc.myEarnings)}</p></div>
                  <div><span className="text-amber-600 dark:text-amber-400">Owe Others</span><p className="font-semibold text-amber-700 dark:text-amber-300">{formatCurrency(calc.amountOwedToOthers)}</p></div>
                </div>
                {form.advanceReceivedByManager > 0 && (
                  <div className="mt-3 pt-3 border-t border-brand-200 dark:border-brand-700/50">
                    <p className="mb-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400">Advance Payment Breakdown</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      <div><span className="text-slate-500 dark:text-slate-400">Already Received</span><p className="font-semibold text-emerald-700 dark:text-emerald-300">{formatCurrency(calc.myEarningsAlreadyReceived)}</p></div>
                      <div><span className="text-slate-500 dark:text-slate-400">Still Owed to Me</span><p className="font-semibold text-orange-700 dark:text-orange-300">{formatCurrency(calc.myEarningsStillOwed)}</p></div>
                    </div>
                  </div>
                )}
              </div>
            </fieldset>

            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/30">
              <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800 dark:text-slate-200" onClick={() => setShowAdvancedSettings((prev) => !prev)}>
                <span>Advanced Settings</span>
                <span className="text-lg text-slate-500">{showAdvancedSettings ? "−" : "+"}</span>
              </button>
              {(showAdvancedSettings || !isMobileView) && (
                <div className="px-4 pb-4">
                  <div className="rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/60">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelCls}>Manager Bonus Type</label>
                        <select className={inputCls} value={form.managerBonusType} onChange={(e) => set("managerBonusType", e.target.value as "fixed" | "percentage")}>
                          <option value="fixed">Fixed Amount ($)</option>
                          <option value="percentage">Percentage (%)</option>
                        </select>
                      </div>
                      <div>
                        <label className={labelCls}>Bonus Amount {form.managerBonusType === "percentage" ? "(%)" : "($)"}</label>
                        <input type="number" min={0} step="0.01" className={inputCls} value={form.managerBonusAmount === 0 ? "" : form.managerBonusAmount} onChange={(e) => { const val = e.target.value; set("managerBonusAmount", val === "" || val === "-" ? 0 : Math.max(0, Number(val))); }} onBlur={(e) => { if (e.target.value === "" || e.target.value === "-") set("managerBonusAmount", 0); }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <fieldset className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/30">
              <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Payment Status</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 dark:bg-slate-800/50">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 dark:text-brand-400 focus:ring-brand-500 dark:focus:ring-brand-400" checked={form.paymentReceived} onChange={(e) => { set("paymentReceived", e.target.checked); if (e.target.checked && !form.paymentReceivedDate) set("paymentReceivedDate", new Date().toISOString().split("T")[0]); if (!e.target.checked) set("paymentReceivedDate", ""); }} />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Payment received from client</span>
                  </label>
                  {form.paymentReceived && (
                    <div className="mt-2">
                      <label className={labelCls}>Date received</label>
                      <input type="date" className={inputCls} value={form.paymentReceivedDate} onChange={(e) => set("paymentReceivedDate", e.target.value)} />
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 dark:bg-slate-800/50">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 dark:text-brand-400 focus:ring-brand-500 dark:focus:ring-brand-400" checked={form.bandPaid} onChange={(e) => { set("bandPaid", e.target.checked); if (e.target.checked && !form.bandPaidDate) set("bandPaidDate", new Date().toISOString().split("T")[0]); if (!e.target.checked) set("bandPaidDate", ""); }} />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Band members paid</span>
                  </label>
                  {form.bandPaid && (
                    <div className="mt-2">
                      <label className={labelCls}>Date paid</label>
                      <input type="date" className={inputCls} value={form.bandPaidDate} onChange={(e) => set("bandPaidDate", e.target.value)} />
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-950/30 p-3">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 rounded border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 focus:ring-amber-500 dark:focus:ring-amber-400" checked={form.managerInstantPayment} onChange={(e) => set("managerInstantPayment", e.target.checked)} />
                    <span className="text-sm font-medium text-amber-900 dark:text-amber-300">I will pay the band myself — I must arrange payment</span>
                  </label>
                  <p className="mt-1.5 text-xs text-amber-900 dark:text-amber-200">✓ Checked: You agree to pay band members directly. After you make the payment, mark "Band members paid" and record the date so the record reflects that the band has been paid.</p>
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">✗ Unchecked: Payment is expected from the client or handled later.</p>
                </div>

                <div className="rounded-lg border border-cyan-200 dark:border-cyan-700/50 bg-cyan-50 dark:bg-cyan-950/30 p-3 sm:col-span-2">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4 rounded border-cyan-300 dark:border-cyan-700 text-cyan-600 dark:text-cyan-400 focus:ring-cyan-500 dark:focus:ring-cyan-400" checked={form.managerHandlesDistribution} onChange={(e) => set("managerHandlesDistribution", e.target.checked)} />
                    <span className="text-sm font-medium text-cyan-900 dark:text-cyan-300">I'm responsible for splitting fees to band members</span>
                  </label>
                  <p className="mt-1.5 text-xs text-cyan-800 dark:text-cyan-400">✓ Checked: You handle payment distribution and owe band members their share<br />✗ Unchecked: Band members get paid directly (e.g., by the client)</p>
                </div>
              </div>
            </fieldset>

            <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/30">
              <button type="button" className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-800 dark:text-slate-200" onClick={() => setShowAdditionalInfo((prev) => !prev)}>
                <span>Additional Notes & Info</span>
                <span className="text-lg text-slate-500">{showAdditionalInfo ? "−" : "+"}</span>
              </button>
              {(showAdditionalInfo || !isMobileView) && (
                <div className="space-y-4 px-4 pb-4">
                  <fieldset className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
                    <legend className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-200">Advance Payments (Optional)</legend>
                    <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Track advance payments. If left empty, amounts will be distributed evenly among musicians.</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="rounded-lg border border-green-200 dark:border-green-700/50 bg-green-50 dark:bg-green-950/30 p-3">
                        <label className={labelCls}>Advance Received from Client ($)</label>
                        <input type="number" min={0} step="0.01" className={inputCls} placeholder="0.00" value={form.advanceReceivedByManager === 0 ? "" : form.advanceReceivedByManager} onChange={(e) => { const val = e.target.value; set("advanceReceivedByManager", val === "" || val === "-" ? 0 : Math.max(0, Number(val))); }} onBlur={(e) => { if (e.target.value === "" || e.target.value === "-") set("advanceReceivedByManager", 0); }} />
                        <p className="mt-2 text-xs text-green-700 dark:text-green-400">Amount you already received as advance</p>
                      </div>

                      <div className="rounded-lg border border-orange-200 dark:border-orange-700/50 bg-orange-50 dark:bg-orange-950/30 p-3">
                        <label className={labelCls}>Advance Paid to Musicians ($)</label>
                        <input type="number" min={0} step="0.01" className={inputCls} placeholder="0.00" value={form.advanceToMusicians === 0 ? "" : form.advanceToMusicians} onChange={(e) => { const val = e.target.value; set("advanceToMusicians", val === "" || val === "-" ? 0 : Math.max(0, Number(val))); }} onBlur={(e) => { if (e.target.value === "" || e.target.value === "-") set("advanceToMusicians", 0); }} />
                        <p className="mt-2 text-xs text-orange-700 dark:text-orange-400">Amount you already paid to band members</p>
                      </div>
                    </div>
                  </fieldset>

                  <fieldset className="mb-0 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/30">
                    <label className={labelCls}>Notes</label>
                    <textarea rows={2} className={inputCls} placeholder="Any additional notes..." value={form.notes} onChange={(e) => set("notes", e.target.value)} />
                  </fieldset>
                </div>
              )}
            </div>
          </form>

          <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-700 dark:bg-slate-900/90 sm:px-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-2">
                {gig && onDelete && <button type="button" onClick={() => onDelete(gig)} className="rounded-lg border border-red-300 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-700 dark:bg-slate-800 dark:text-red-400 dark:hover:bg-red-950/30">Delete</button>}
                {gig && <button type="button" onClick={() => setShowNotesEditor(true)} className="rounded-lg border border-brand-300 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-600 transition hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950/30 dark:text-brand-400 dark:hover:bg-brand-900/40">📝 Notes</button>}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={handleCancelAction} disabled={loading} className="touch-target inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">Cancel</button>
                <button type="submit" form="gig-form" disabled={loading} className="touch-target inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50">{loading && <Icons.Spinner className="h-4 w-4" />}{gig ? "Save Changes" : "Save"}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showNotesEditor && gig && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 px-4 py-6 backdrop-blur-sm sm:py-10">
          <div className="w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">
            <div className="border-b border-slate-200/80 bg-gradient-to-r from-slate-50 to-white px-5 py-4 dark:border-slate-700 dark:from-slate-950 dark:to-slate-900 sm:px-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{isDutch ? `Notities voor "${gig.eventName}"` : `Notes for "${gig.eventName}"`}</h2>
                <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{concertMode ? (isDutch ? "Concertmodus is alleen-lezen: tik op de afbeelding om deze fullscreen te openen." : "Concert mode is view-only: tap the image to open it fullscreen.") : (isDutch ? "Repetitiemodus is om foto’s, notities en tekeningen toe te voegen of aan te passen." : "Rehearsal mode lets you add or edit photos, notes, and drawings.")}</p>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800/80">
                  <button type="button" onClick={() => setPerformanceMode(false)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${!concertMode ? "bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white" : "text-slate-500 hover:text-slate-700 dark:text-slate-300"}`}>{isDutch ? "Repetitie" : "Rehearsal"}</button>
                  <button type="button" onClick={() => setPerformanceMode(true)} className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${concertMode ? "bg-brand-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-700 dark:text-slate-300"}`}>{isDutch ? "Concert" : "Concert"}</button>
                </div>
                <button onClick={() => setShowNotesEditor(false)} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"><Icons.Close className="h-5 w-5" />{isDutch ? "Sluiten" : "Close"}</button>
              </div>
            </div>
            <div className="max-h-[78vh] overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              <PhotoAnnotationEditor onExport={() => {}} persistId={gig.id} concertMode={concertMode} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

