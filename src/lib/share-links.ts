import { randomBytes } from "crypto";
import { calculateGigFinancials } from "@/lib/calculations";

export interface ShareLinkVisibility {
  showEventName: boolean;
  showGigDate: boolean;
  showBookingDate: boolean;
  showVenuePerformers: boolean;
  showNotes: boolean;
  showPerformanceFee: boolean;
  showPerMusicianShare: boolean;
  showManagerEarnings: boolean;
  showManagerBonus: boolean;
  showTechnicalFee: boolean;
  showTotalCost: boolean;
  showClientPaymentStatus: boolean;
  showBandPaymentStatus: boolean;
  hideAllFinancialInformation: boolean;
}

export const DEFAULT_SHARE_LINK_VISIBILITY: ShareLinkVisibility = {
  showEventName: true,
  showGigDate: true,
  showBookingDate: false,
  showVenuePerformers: true,
  showNotes: false,
  showPerformanceFee: false,
  showPerMusicianShare: false,
  showManagerEarnings: false,
  showManagerBonus: false,
  showTechnicalFee: false,
  showTotalCost: false,
  showClientPaymentStatus: false,
  showBandPaymentStatus: false,
  hideAllFinancialInformation: true,
};

const FINANCIAL_KEYS: Array<keyof ShareLinkVisibility> = [
  "showPerformanceFee",
  "showPerMusicianShare",
  "showManagerEarnings",
  "showManagerBonus",
  "showTechnicalFee",
  "showTotalCost",
];

export function normalizeShareLinkVisibility(
  value: unknown
): ShareLinkVisibility {
  const input =
    value && typeof value === "object"
      ? (value as Partial<ShareLinkVisibility>)
      : {};

  const normalized: ShareLinkVisibility = {
    showEventName: input.showEventName ?? DEFAULT_SHARE_LINK_VISIBILITY.showEventName,
    showGigDate: input.showGigDate ?? DEFAULT_SHARE_LINK_VISIBILITY.showGigDate,
    showBookingDate: input.showBookingDate ?? DEFAULT_SHARE_LINK_VISIBILITY.showBookingDate,
    showVenuePerformers:
      input.showVenuePerformers ??
      DEFAULT_SHARE_LINK_VISIBILITY.showVenuePerformers,
    showNotes: input.showNotes ?? DEFAULT_SHARE_LINK_VISIBILITY.showNotes,
    showPerformanceFee:
      input.showPerformanceFee ?? DEFAULT_SHARE_LINK_VISIBILITY.showPerformanceFee,
    showPerMusicianShare:
      input.showPerMusicianShare ??
      DEFAULT_SHARE_LINK_VISIBILITY.showPerMusicianShare,
    showManagerEarnings:
      input.showManagerEarnings ??
      DEFAULT_SHARE_LINK_VISIBILITY.showManagerEarnings,
    showManagerBonus:
      input.showManagerBonus ?? DEFAULT_SHARE_LINK_VISIBILITY.showManagerBonus,
    showTechnicalFee:
      input.showTechnicalFee ?? DEFAULT_SHARE_LINK_VISIBILITY.showTechnicalFee,
    showTotalCost: input.showTotalCost ?? DEFAULT_SHARE_LINK_VISIBILITY.showTotalCost,
    showClientPaymentStatus:
      input.showClientPaymentStatus ??
      DEFAULT_SHARE_LINK_VISIBILITY.showClientPaymentStatus,
    showBandPaymentStatus:
      input.showBandPaymentStatus ??
      DEFAULT_SHARE_LINK_VISIBILITY.showBandPaymentStatus,
    hideAllFinancialInformation:
      input.hideAllFinancialInformation ??
      DEFAULT_SHARE_LINK_VISIBILITY.hideAllFinancialInformation,
  };

  if (normalized.hideAllFinancialInformation) {
    for (const key of FINANCIAL_KEYS) {
      normalized[key] = false;
    }
  }

  return normalized;
}

export function generateShareToken(minLength = 16): string {
  const bytes = Math.max(12, Math.ceil(minLength * 0.75));
  return randomBytes(bytes).toString("base64url");
}

interface GigFinancialInput {
  performanceFee: number;
  technicalFee: number;
  managerBonusType: string;
  managerBonusAmount: number;
  numberOfMusicians: number;
  claimPerformanceFee: boolean;
  claimTechnicalFee: boolean;
  technicalFeeClaimAmount: number | null;
  advanceReceivedByManager: number;
  advanceToMusicians: number;
  isCharity: boolean;
  performanceDistribution: string;
  managerPerformanceAmount: number | null;
}

export function getSharedGigFinancialSummary(gig: GigFinancialInput) {
  const managerBonusType = gig.managerBonusType === "percentage" ? "percentage" : "fixed";
  const performanceDistribution =
    gig.performanceDistribution === "managerFixed" ||
    gig.performanceDistribution === "custom"
      ? gig.performanceDistribution
      : "equal";

  const calc = calculateGigFinancials(
    gig.performanceFee,
    gig.technicalFee,
    managerBonusType,
    gig.managerBonusAmount,
    gig.numberOfMusicians,
    gig.claimPerformanceFee,
    gig.claimTechnicalFee,
    gig.technicalFeeClaimAmount,
    gig.advanceReceivedByManager,
    gig.advanceToMusicians,
    gig.isCharity,
    performanceDistribution,
    gig.managerPerformanceAmount
  );

  return {
    performanceFee: gig.performanceFee,
    perMusicianShare: calc.amountPerMusician,
    managerEarnings: calc.myEarnings,
    managerBonus: calc.actualManagerBonus,
    technicalFee: gig.technicalFee,
    totalCost: calc.totalReceived,
  };
}
