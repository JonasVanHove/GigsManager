"use client";

import { useState } from "react";
import { useSettings } from "./SettingsProvider";

const CURRENCIES = [
  { code: "EUR", label: "Euro (€)", symbol: "€" },
  { code: "USD", label: "US Dollar ($)", symbol: "$" },
  { code: "GBP", label: "British Pound (£)", symbol: "£" },
  { code: "CHF", label: "Swiss Franc (CHF)", symbol: "CHF" },
  { code: "SEK", label: "Swedish Krona (kr)", symbol: "kr" },
  { code: "NOK", label: "Norwegian Krone (kr)", symbol: "kr" },
  { code: "DKK", label: "Danish Krone (kr)", symbol: "kr" },
  { code: "PLN", label: "Polish Złoty (zł)", symbol: "zł" },
  { code: "CZK", label: "Czech Koruna (Kč)", symbol: "Kč" },
  { code: "HUF", label: "Hungarian Forint (Ft)", symbol: "Ft" },
  { code: "CAD", label: "Canadian Dollar (CA$)", symbol: "CA$" },
  { code: "AUD", label: "Australian Dollar (A$)", symbol: "A$" },
  { code: "JPY", label: "Japanese Yen (¥)", symbol: "¥" },
];

interface SettingsModalProps {
  onClose: () => void;
}

export default function SettingsModal({ onClose }: SettingsModalProps) {
  const { settings, updateSettings } = useSettings();
  const [currency, setCurrency] = useState(settings.currency);
  const [claimPerf, setClaimPerf] = useState(settings.claimPerformanceFee);
  const [claimTech, setClaimTech] = useState(settings.claimTechnicalFee);
  const [theme, setTheme] = useState(settings.theme);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const hasChanges =
    currency !== settings.currency ||
    claimPerf !== settings.claimPerformanceFee ||
    claimTech !== settings.claimTechnicalFee ||
    theme !== settings.theme;

  const handleSave = async () => {
    if (!hasChanges) {
      onClose();
      return;
    }

    setSaving(true);
    setError("");

    try {
      await updateSettings({
        currency,
        claimPerformanceFee: claimPerf,
        claimTechnicalFee: claimTech,
        theme,
      });
      onClose();
    } catch {
      setError("Failed to save settings. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Settings</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {/* ── Currency ────────────────────────── */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm transition focus:border-brand-500 dark:focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:focus:ring-brand-400/20"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              All amounts will be displayed in this currency.
            </p>
          </div>

          {/* ── Theme ──────────────────────────── */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Appearance
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={`rounded-lg border-2 px-3 py-2 text-sm font-medium transition ${
                    theme === t
                      ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30 text-brand-700 dark:text-brand-300"
                      : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {theme === "system"
                ? "Matches your device settings"
                : theme === "dark"
                ? "Always dark mode"
                : "Always light mode"}
            </p>
          </div>
          <fieldset>
            <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Fee components you claim
            </legend>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
              Toggle which fee components count towards your personal earnings.
            </p>

            <div className="space-y-3">
              {/* Performance fee toggle */}
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-3 cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/70">
                <input
                  type="checkbox"
                  checked={claimPerf}
                  onChange={(e) => setClaimPerf(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 dark:text-brand-400 focus:ring-brand-500 dark:focus:ring-brand-400"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Performance fee</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Your share of the performance fee split among all musicians
                  </p>
                </div>
              </label>

              {/* Technical fee toggle */}
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 px-4 py-3 cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/70">
                <input
                  type="checkbox"
                  checked={claimTech}
                  onChange={(e) => setClaimTech(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-brand-600 dark:text-brand-400 focus:ring-brand-500 dark:focus:ring-brand-400"
                />
                <div>
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Technical fee</span>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    The full technical fee (not split, goes to the manager)
                  </p>
                </div>
              </label>
            </div>
          </fieldset>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-700 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 dark:bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 dark:hover:bg-brand-700 disabled:opacity-50"
          >
            {saving && (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
