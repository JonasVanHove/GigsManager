import type { GigCalculations } from "@/types";

/**
 * Core financial calculations for a gig.
 *
 * Rules:
 *  - Performance fee is split **evenly** among all performers.
 *  - Manager bonus is added on top and goes entirely to the manager.
 *  - Technical fee is **not** split — it belongs to the manager.
 *  - "Amount owed to others" = the shares that must be paid to the other musicians.
 *  - Advance payments are deducted from what's owed:
 *    - advanceReceivedByManager: reduces what you owe from the client
 *    - advanceToMusicians: reduces what you owe to band members
 *
 * The `claimPerformanceFee` and `claimTechnicalFee` flags control:
 *  - If NOT claiming performance fee:
 *    - Manager is NOT counted as one of the performers
 *    - Fee is split among only the (numberOfMusicians - 1) actual performers
 *    - Manager owes the full performance fee to those performers
 *    - Manager earns only bonus + technical fee
 *  - If NOT claiming technical fee, the tech fee is excluded from `myEarnings`.
 */
export function calculateGigFinancials(
  performanceFee: number,
  technicalFee: number,
  managerBonusType: "fixed" | "percentage",
  managerBonusAmount: number,
  numberOfMusicians: number,
  claimPerformanceFee = true,
  claimTechnicalFee = true,
  technicalFeeClaimAmount: number | null = null,
  advanceReceivedByManager: number = 0,
  advanceToMusicians: number = 0,
  isCharity: boolean = false
): GigCalculations {
  // If it's a charity performance, all fees are $0
  if (isCharity) {
    return {
      actualManagerBonus: 0,
      totalReceived: 0,
      amountPerMusician: 0,
      myEarnings: 0,
      amountOwedToOthers: 0,
    };
  }

  const actualManagerBonus =
    managerBonusType === "percentage"
      ? performanceFee * (managerBonusAmount / 100)
      : managerBonusAmount;

  const totalReceived = performanceFee + technicalFee + actualManagerBonus;
  
  // If not claiming performance fee, manager is not part of the split
  const musiciansInSplit = claimPerformanceFee 
    ? numberOfMusicians 
    : Math.max(1, numberOfMusicians - 1);
  
  const amountPerMusician =
    musiciansInSplit > 0 ? performanceFee / musiciansInSplit : 0;

  const perfShare = claimPerformanceFee ? amountPerMusician : 0;
  
  // Technical share: 
  // - If not claiming: 0
  // - If claiming all (no specific amount): technicalFee
  // - If claiming specific amount: min(that amount, technicalFee)
  const techShare = !claimTechnicalFee 
    ? 0 
    : (technicalFeeClaimAmount === null 
        ? technicalFee 
        : Math.min(technicalFeeClaimAmount, technicalFee));
  
  const myEarnings = perfShare + techShare + actualManagerBonus;

  // Owed to band members: always (numberOfMusicians - 1) * per person share
  // Minus any advance already paid to them
  const amountOwedToBand =
    numberOfMusicians > 1 ? (numberOfMusicians - 1) * amountPerMusician : 0;
  const netAmountOwedToBand = Math.max(0, amountOwedToBand - advanceToMusicians);

  // Owed for technical fee: if claiming but not all of it, owe the rest
  // If not claiming at all, owe everything
  const amountOwedForTechnical = !claimTechnicalFee 
    ? technicalFee 
    : (technicalFeeClaimAmount === null 
        ? 0 
        : Math.max(0, technicalFee - technicalFeeClaimAmount));

  // Total owed (advance already paid is deducted)
  const amountOwedToOthers = netAmountOwedToBand + amountOwedForTechnical;

  return {
    actualManagerBonus: round(actualManagerBonus),
    totalReceived: round(totalReceived),
    amountPerMusician: round(amountPerMusician),
    myEarnings: round(myEarnings),
    amountOwedToOthers: round(amountOwedToOthers),
  };
}

// --- Formatting helpers ------------------------------------------------------

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

// --- Internal ----------------------------------------------------------------

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
