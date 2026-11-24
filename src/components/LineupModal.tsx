"use client";

import { useState } from "react";
import { Icons } from "./Icons";
import { MemberLineup, LineupStatus } from "@/lib/lineup-manager";
import { useAuth } from "./AuthProvider";
import { useToast } from "./ToastContainer";

interface LineupModalProps {
  member: {
    id: string;
    name: string;
    lineup?: MemberLineup;
  };
  bandName: string;
  isDutch: boolean;
  onClose: () => void;
  onSaved: (updatedLineup: MemberLineup) => void;
}

export default function LineupModal({
  member,
  bandName,
  isDutch,
  onClose,
  onSaved,
}: LineupModalProps) {
  const { getAccessToken } = useAuth();
  const toast = useToast();

  const initialLineup: MemberLineup = member.lineup || {
    status: "active",
    startDate: null,
    departureDate: null,
    absenceStartDate: null,
    absenceEndDate: null,
    notes: null,
  };

  const [status, setStatus] = useState<LineupStatus>(initialLineup.status || "active");
  const [departureDate, setDepartureDate] = useState(initialLineup.departureDate || "");
  const [absenceStartDate, setAbsenceStartDate] = useState(initialLineup.absenceStartDate || "");
  const [absenceEndDate, setAbsenceEndDate] = useState(initialLineup.absenceEndDate || "");
  const [notes, setNotes] = useState(initialLineup.notes || "");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("No token");

      const payloadLineup: MemberLineup = {
        status,
        departureDate: status === "departed" ? (departureDate || new Date().toISOString().slice(0, 10)) : null,
        absenceStartDate: status === "temporary_absence" ? (absenceStartDate || null) : null,
        absenceEndDate: status === "temporary_absence" ? (absenceEndDate || null) : null,
        notes: notes.trim() || null,
      };

      const res = await fetch(`/api/band-members/${member.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bandName,
          lineup: payloadLineup,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update lineup");
      }

      toast.success(
        isDutch
          ? `Samenstelling voor ${member.name} bijgewerkt`
          : `Updated lineup for ${member.name}`
      );
      onSaved(payloadLineup);
      onClose();
    } catch (err: any) {
      toast.error(err.message || (isDutch ? "Opslaan mislukt" : "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {isDutch ? "Band samenstelling" : "Band Lineup"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {member.name} • {bandName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <Icons.X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {isDutch ? "Status in deze band" : "Status in this band"}
            </label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStatus("active")}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  status === "active"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:border-emerald-500/50 dark:bg-emerald-950/40 dark:text-emerald-300"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                🟢 {isDutch ? "Actief" : "Active"}
              </button>
              <button
                type="button"
                onClick={() => setStatus("temporary_absence")}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  status === "temporary_absence"
                    ? "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-300"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                🟡 {isDutch ? "Tijdelijk weg" : "Temporary leave"}
              </button>
              <button
                type="button"
                onClick={() => setStatus("departed")}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  status === "departed"
                    ? "border-rose-500 bg-rose-50 text-rose-700 dark:border-rose-500/50 dark:bg-rose-950/40 dark:text-rose-300"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                }`}
              >
                🔴 {isDutch ? "Gestopt" : "Departed"}
              </button>
            </div>
          </div>

          {status === "temporary_absence" && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 space-y-3 dark:border-amber-900/50 dark:bg-amber-950/20">
              <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
                {isDutch
                  ? "Tijdens deze periode wordt dit lid bij optredens gemarkeerd als afwezig."
                  : "During this period, this member will be flagged as absent for gigs."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    {isDutch ? "Van datum" : "From date"}
                  </label>
                  <input
                    type="date"
                    value={absenceStartDate}
                    onChange={(e) => setAbsenceStartDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    {isDutch ? "Tot datum" : "Until date"}
                  </label>
                  <input
                    type="date"
                    value={absenceEndDate}
                    onChange={(e) => setAbsenceEndDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </div>
              </div>
            </div>
          )}

          {status === "departed" && (
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 space-y-3 dark:border-rose-900/50 dark:bg-rose-950/20">
              <p className="text-xs text-rose-800 dark:text-rose-300 font-medium">
                {isDutch
                  ? "Vanaf deze datum heeft dit lid de band definitief verlaten."
                  : "From this date onwards, this member has permanently left the band."}
              </p>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                  {isDutch ? "Gestopt vanaf datum" : "Departed as of"}
                </label>
                <input
                  type="date"
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              {isDutch ? "Toelichting / Notitie" : "Notes / Reason"}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                isDutch
                  ? "bijv. Vervanger Tom tot november, of solo album tour"
                  : "e.g. Substitute player until November"
              }
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {isDutch ? "Annuleren" : "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? (isDutch ? "Opslaan..." : "Saving...") : (isDutch ? "Opslaan" : "Save")}
          </button>
        </div>
      </div>
    </div>
  );
}
