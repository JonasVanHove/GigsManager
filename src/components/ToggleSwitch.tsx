"use client";

/**
 * Small labelled on/off switch.
 *
 * Uses `role="switch"` with `aria-checked` (rather than a checkbox) so screen
 * readers announce on/off rather than checked/unchecked, and keeps the knob
 * styling identical to the switches already used in SharedLinksTab.
 */
export default function ToggleSwitch({
  id,
  checked,
  onChange,
  label,
  description,
  disabled = false,
  testId,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white/70 p-3 dark:border-slate-700 dark:bg-slate-900/50">
      <div className="min-w-0">
        <label
          htmlFor={id}
          className="block cursor-pointer text-sm font-medium text-slate-800 dark:text-slate-100"
        >
          {label}
        </label>
        {description && (
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            {description}
          </p>
        )}
      </div>

      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-testid={testId}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-slate-900 ${
          checked ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}