"use client";

/**
 * Gig Financials — expenses, net profit and the band payout split (v1.40.0).
 *
 * Two audiences, one screen:
 *  - the gig owner edits the numbers and picks who shares the split;
 *  - everyone else gets a read-only view of their own payout.
 *
 * `isFinancialHidden` is honoured here as well as in the API. Hiding a gig's
 * money is an explicit owner choice, and a modal reachable from the card is
 * exactly the kind of side door that setting would otherwise leak through.
 *
 * All arithmetic is delegated to `@/lib/financials`; this component only renders.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { calculateGigFinancialBreakdown, type PayoutMember } from "@/lib/financials";
import { useAuth } from "./AuthProvider";
import { useToast } from "./ToastContainer";
import { Icons } from "./Icons";
import type { Gig } from "@/types";

export interface FinancialsMember {
  /** GigBandMember.id — the join row, not the band member's own id. */
  id: string;
  name: string;
  included: boolean;
  /** null = take the computed share. */
  customAmount: number | null;
  /** True when this member is the signed-in user. */
  isSelf?: boolean;
}

/**
 * Editable row. `customAmount` widens to a string while editing so a half-typed
 * "12." is not rewritten to "12" (and then to "0") under the cursor.
 */
interface EditableRow extends Omit<FinancialsMember, "customAmount"> {
  customAmount: string;
}

interface GigFinancialsModalProps {
  gig: Gig;
  members: FinancialsMember[];
  fmtCurrency: (amount: number) => string;
  canEdit?: boolean;
  isDutch?: boolean;
  onClose: () => void;
  onSaved?: (gigId: string) => void;
}

const t = (isDutch: boolean, en: string, nl: string) => (isDutch ? nl : en);

/** Text field that keeps its own raw string so "12." is not rewritten mid-typing. */
function AmountField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <div>
      <label
        htmlFor={props.id}
        className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300"
      >
        {props.label}
      </label>
      <input
        id={props.id}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={props.value}
        disabled={props.disabled}
        data-testid={props.id}
        onChange={(e) => props.onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
      />
      {props.hint && <p className="mt-1 text-xs text-slate-500">{props.hint}</p>}
    </div>
  );
}

export default function GigFinancialsModal({
  gig,
  members,
  fmtCurrency,
  canEdit = true,
  isDutch = false,
  onClose,
  onSaved,
}: GigFinancialsModalProps) {
  const { getAccessToken } = useAuth();
  const { showToast } = useToast();

  const [paExpenses, setPaExpenses] = useState(String(gig.paExpenses ?? 0));
  const [travelExpenses, setTravelExpenses] = useState(String(gig.travelExpenses ?? 0));
  const [otherExpenses, setOtherExpenses] = useState(String(gig.otherExpenses ?? 0));
  const [commission, setCommission] = useState(String(gig.commission ?? 0));
  const [feeOverride, setFeeOverride] = useState(
    gig.totalFeeOverride === null || gig.totalFeeOverride === undefined
      ? ""
      : String(gig.totalFeeOverride)
  );
  const [rows, setRows] = useState<EditableRow[]>(
    members.map((m) => ({
      ...m,
      customAmount: m.customAmount === null ? "" : String(m.customAmount),
    }))
  );
  const [saving, setSaving] = useState(false);
  // Portals need a real DOM. The card renders this on the client only, but the
  // guard keeps SSR and the first client render in agreement.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  /**
   * Renders into `document.body` rather than inline.
   *
   * The modal lives inside a gig card, and a card is not a neutral parent: any
   * ancestor with a transform, filter or containment turns `position: fixed`
   * into a box relative to *that* element instead of the viewport. The card's
   * own header then paints over the dialog and swallows clicks — which is
   * exactly what Safari did to the Cancel button. Portalling to <body> removes
   * the card from the containing-block chain entirely.
   */
  const portal = (node: React.ReactNode) =>
    mounted ? createPortal(node, document.body) : null;

  // Escape closes, and the body stops scrolling behind the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose, saving]);

  const toMembers = useCallback(
    (list: typeof rows): PayoutMember[] =>
      list.map((m) => ({
        id: m.id,
        name: m.name,
        included: m.included,
        customAmount: m.customAmount === "" ? null : Number(m.customAmount),
      })),
    []
  );

  // Real-time: every keystroke re-runs the pure engine.
  const breakdown = useMemo(
    () =>
      calculateGigFinancialBreakdown({
        performanceFee: gig.performanceFee,
        technicalFee: gig.technicalFee,
        totalFeeOverride: feeOverride.trim() === "" ? null : Number(feeOverride),
        expenses: {
          paExpenses: Number(paExpenses) || 0,
          travelExpenses: Number(travelExpenses) || 0,
          otherExpenses: Number(otherExpenses) || 0,
          commission: Number(commission) || 0,
        },
        members: toMembers(rows),
      }),
    [gig.performanceFee, gig.technicalFee, feeOverride, paExpenses, travelExpenses, otherExpenses, commission, rows, toMembers]
  );
  const amountFor = (id: string) => breakdown.lines.find((l) => l.id === id)?.amount ?? 0;

  const toggleMember = (id: string) =>
    setRows((prev) => prev.map((m) => (m.id === id ? { ...m, included: !m.included } : m)));

  const setCustom = (id: string, value: string) =>
    setRows((prev) => prev.map((m) => (m.id === id ? { ...m, customAmount: value } : m)));

  const save = async () => {
    setSaving(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("no-session");
      const res = await fetch(`/api/gigs/${gig.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          paExpenses: Number(paExpenses) || 0,
          travelExpenses: Number(travelExpenses) || 0,
          otherExpenses: Number(otherExpenses) || 0,
          commission: Number(commission) || 0,
          totalFeeOverride: feeOverride.trim() === "" ? null : Number(feeOverride),
          payouts: rows.map((m) => ({
            gigBandMemberId: m.id,
            payoutIncluded: m.included,
            customPayoutAmount: m.customAmount === "" ? null : Number(m.customAmount),
          })),
        }),
      });
      if (!res.ok) throw new Error(`status-${res.status}`);
      showToast({
        message: t(isDutch, "Financials saved", "Financiën opgeslagen"),
        type: "success",
      });
      onSaved?.(gig.id);
      onClose();
    } catch (error) {
      console.error("[gig-financials] save failed:", error);
      showToast({
        message: t(isDutch, "Could not save the financials.", "Kon de financiën niet opslaan."),
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  // A hidden gig shows nothing at all — not even the total.
  if (gig.isFinancialHidden) {
    return portal(
      <div
        data-testid="gig-financials-modal"
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-slate-900"
        >
          <p className="text-sm text-slate-700 dark:text-slate-200">
            {t(isDutch, "The financials for this gig are private.", "De financiën van deze gig zijn privé.")}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 w-full rounded-lg border border-slate-300 py-2 text-sm font-semibold dark:border-slate-600"
          >
            {t(isDutch, "Close", "Sluiten")}
          </button>
        </div>
      </div>
    );
  }

  const readOnlyMember = rows.find((m) => m.isSelf);

  // ── Band member view ───────────────────────────────────────────────────
  // A non-editor gets one number that matters to them, plus the context needed
  // to trust it. Showing the whole band's table to someone who only needs their
  // own line is noise; hiding the breakdown entirely would be mysterious.
  if (!canEdit) {
    const mine = readOnlyMember ? amountFor(readOnlyMember.id) : breakdown.payoutPerMember;
    return portal(
      <div
        data-testid="gig-financials-modal"
        className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-slate-900"
        >
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
            {t(isDutch, "Your payout", "Jouw uitbetaling")}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{gig.eventName}</p>

          <p
            data-testid="financials-my-payout"
            className="mt-4 text-3xl font-extrabold text-emerald-600 dark:text-emerald-400"
          >
            {fmtCurrency(mine)}
          </p>

          <dl className="mt-4 space-y-1 border-t border-slate-200 pt-3 text-sm dark:border-slate-700">
            <div className="flex justify-between">
              <dt className="text-slate-500">{t(isDutch, "Gig gross", "Bruto gage")}</dt>
              <dd data-testid="financials-readonly-gross">{fmtCurrency(breakdown.totalFee)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">{t(isDutch, "Costs", "Kosten")}</dt>
              <dd>-{fmtCurrency(breakdown.totalExpenses)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt className="text-slate-700 dark:text-slate-200">
                {t(isDutch, "Net to the band", "Netto voor de band")}
              </dt>
              <dd data-testid="financials-readonly-net">{fmtCurrency(breakdown.netProfit)}</dd>
            </div>
          </dl>

          <button
            type="button"
            data-testid="financials-close"
            onClick={onClose}
            className="mt-5 w-full rounded-lg border border-slate-300 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {t(isDutch, "Close", "Sluiten")}
          </button>
        </div>
      </div>
    );
  }

  // ── Owner / leader view ────────────────────────────────────────────────
  return portal(
    <div
      data-testid="gig-financials-modal"
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t(isDutch, "Gage and expenses", "Gage en kosten")}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 dark:bg-slate-900"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-50">
              {t(isDutch, "Gage & expenses", "Gage & kosten")}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{gig.eventName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(isDutch, "Close", "Sluiten")}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <Icons.X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <AmountField
            id="financials-gross-override"
            label={t(isDutch, "Gross override (optional)", "Bruto override (optioneel)")}
            value={feeOverride}
            onChange={setFeeOverride}
            hint={
              feeOverride.trim() === ""
                ? t(
                    isDutch,
                    `Using fees: ${fmtCurrency(gig.performanceFee + (gig.technicalFee || 0))}`,
                    `Tarieven: ${fmtCurrency(gig.performanceFee + (gig.technicalFee || 0))}`
                  )
                : undefined
            }
          />
          <div />
          <AmountField
            id="financials-pa-expenses"
            label={t(isDutch, "Sound & lights (PA)", "Geluid & licht (PA)")}
            value={paExpenses}
            onChange={setPaExpenses}
          />
          <AmountField
            id="financials-travel-expenses"
            label={t(isDutch, "Travel / fuel", "Reis / brandstof")}
            value={travelExpenses}
            onChange={setTravelExpenses}
          />
          <AmountField
            id="financials-other-expenses"
            label={t(isDutch, "Other costs", "Overige kosten")}
            value={otherExpenses}
            onChange={setOtherExpenses}
          />
          <AmountField
            id="financials-commission"
            label={t(isDutch, "Commission", "Commissie")}
            value={commission}
            onChange={setCommission}
          />
        </div>

        {/* Real-time summary */}
        <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
          <div>
            <p className="text-xs text-slate-500">{t(isDutch, "Total gross", "Bruto totaal")}</p>
            <p data-testid="financials-total-gross" className="text-lg font-bold text-slate-900 dark:text-slate-50">
              {fmtCurrency(breakdown.totalFee)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t(isDutch, "Expenses", "Kosten")}</p>
            <p data-testid="financials-total-expenses" className="text-lg font-bold text-rose-600 dark:text-rose-400">
              -{fmtCurrency(breakdown.totalExpenses)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">{t(isDutch, "Net profit", "Netto winst")}</p>
            <p
              data-testid="financials-net-profit"
              className={`text-lg font-bold ${
                breakdown.netProfit < 0
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {fmtCurrency(breakdown.netProfit)}
            </p>
          </div>
        </div>

        {breakdown.netProfit < 0 && (
          <p
            data-testid="financials-loss-warning"
            className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
          >
            {t(
              isDutch,
              "This gig lost money. Nobody is paid from a negative net — the band owes the difference.",
              "Deze gig verloor geld. Uit een negatief netto wordt niemand betaald — de band is het verschil verschuldigd."
            )}
          </p>
        )}

        {/* Payout split */}
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t(isDutch, "Payout split", "Uitbetaling")}
            </h3>
            <p data-testid="financials-per-member" className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {breakdown.participatingCount === 0
                ? t(isDutch, "No members in the split", "Niemand in de verdeling")
                : `${fmtCurrency(breakdown.payoutPerMember)} ${t(isDutch, "per band member", "per bandlid")}`}
            </p>
          </div>

          {rows.length === 0 ? (
            <p data-testid="financials-no-members" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800/60">
              {t(
                isDutch,
                "No band members are attached to this gig yet.",
                "Er zijn nog geen bandleden aan deze gig gekoppeld."
              )}
            </p>
          ) : (
            <ul className="divide-y divide-slate-200 dark:divide-slate-700">
              {rows.map((m) => (
                <li key={m.id} className="flex items-center gap-3 py-2" data-testid={`financials-row-${m.id}`}>
                  <input
                    type="checkbox"
                    checked={m.included}
                    onChange={() => toggleMember(m.id)}
                    data-testid={`financials-include-${m.id}`}
                    aria-label={t(isDutch, `Include ${m.name}`, `${m.name} meetellen`)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span className={`flex-1 text-sm ${m.included ? "text-slate-900 dark:text-slate-100" : "text-slate-400 line-through"}`}>
                    {m.name}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    placeholder={t(isDutch, "auto", "auto")}
                    value={m.customAmount ?? ""}
                    disabled={!m.included}
                    onChange={(e) => setCustom(m.id, e.target.value)}
                    data-testid={`financials-custom-${m.id}`}
                    aria-label={t(isDutch, `Fixed amount for ${m.name}`, `Vast bedrag voor ${m.name}`)}
                    className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm disabled:opacity-40 dark:border-slate-600 dark:bg-slate-900"
                  />
                  <span
                    data-testid={`financials-amount-${m.id}`}
                    className="w-24 text-right text-sm font-semibold text-slate-900 dark:text-slate-50"
                  >
                    {fmtCurrency(amountFor(m.id))}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {t(isDutch, "Cancel", "Annuleren")}
          </button>
          <button
            type="button"
            data-testid="financials-save"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? t(isDutch, "Saving…", "Opslaan…") : t(isDutch, "Save", "Opslaan")}
          </button>
        </div>
      </div>
    </div>
  );
}
