import type { GigCalculations } from "@/types";

/**
 * Core financial calculations for a gig.
 *
 * Rules:
 *  - Performance fee is split **evenly** among all musicians (including the manager).
 *  - Manager bonus is added on top and goes entirely to the manager.
 *  - Technical fee is **not** split — it belongs to the manager.
 *  - "Amount owed to others" = the shares that must be paid to the other musicians.
 *
 * The `claimPerformanceFee` and `claimTechnicalFee` flags control what the
 * manager actually earns:
 *  - If the manager does NOT claim the performance fee, their share of the
 *    performance-fee split is excluded from `myEarnings`.
 *  - If the manager does NOT claim the technical fee, the tech fee is excluded
 *    from `myEarnings`.
 */
export function calculateGigFinancials(
  performanceFee: number,
  technicalFee: number,
  managerBonusType: "fixed" | "percentage",
  managerBonusAmount: number,
  numberOfMusicians: number,
  claimPerformanceFee = true,
  claimTechnicalFee = true
): GigCalculations {
  const actualManagerBonus =
    managerBonusType === "percentage"
      ? performanceFee * (managerBonusAmount / 100)
      : managerBonusAmount;

  const totalReceived = performanceFee + technicalFee + actualManagerBonus;
  const amountPerMusician =
    numberOfMusicians > 0 ? performanceFee / numberOfMusicians : 0;

  const perfShare = claimPerformanceFee ? amountPerMusician : 0;
  const techShare = claimTechnicalFee ? technicalFee : 0;
  const myEarnings = perfShare + techShare + actualManagerBonus;

  const amountOwedToOthers =
    numberOfMusicians > 1 ? (numberOfMusicians - 1) * amountPerMusician : 0;

  return {
    actualManagerBonus: round(actualManagerBonus),
    totalReceived: round(totalReceived),
    amountPerMusician: round(amountPerMusician),
    myEarnings: round(myEarnings),
    amountOwedToOthers: round(amountOwedToOthers),
  };
}

// ─── Formatting helpers ──────────────────────────────────────────────────────

export function formatCurrency(
  amount: number,
  currency = "EUR",
  locale?: string
): string {
  const loc = locale || (currency === "USD" ? "en-US" : currency === "EUR" ? "nl-BE" : "en-US");
  return new Intl.NumberFormat(loc, {
    style: "currency",
    currency,
  }).format(amount);
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Internal ────────────────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
