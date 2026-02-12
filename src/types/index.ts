// --- Gig entity as returned by the API ---------------------------------------

export interface Gig {
  id: string;
  eventName: string;
  date: string; // ISO string
  performers: string;
  numberOfMusicians: number;
  isCharity: boolean; // whether this is a charity/pro bono performance
  performanceFee: number;
  technicalFee: number;
  managerBonusType: "fixed" | "percentage";
  managerBonusAmount: number;
  claimPerformanceFee: boolean; // claim this fee for this gig
  claimTechnicalFee: boolean; // claim this fee for this gig
  technicalFeeClaimAmount: number | null; // amount of technical fee to claim (null = all)
  managerHandlesDistribution: boolean; // whether manager handles payment split to band members
  paymentReceived: boolean;
  paymentReceivedDate: string | null;
  bandPaid: boolean;
  bandPaidDate: string | null;
  advanceReceivedByManager: number; // Advance amount you received from client
  advanceToMusicians: number; // Advance amount you paid to musicians
  notes: string | null;
  bookingDate: string; // ISO string - when booking was made
  userId: string; // belongs to this user
  createdAt: string;
  updatedAt: string;
}

// --- User entity --------------------------------------------------------------

export interface User {
  id: string;
  supabaseId: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

// --- Auth session -------------------------------------------------------------

export interface AuthSession {
  user: {
    id: string;
    email: string;
    user_metadata?: {
      name?: string;
    };
  } | null;
  isLoading: boolean;
}

// --- Form data sent to the API -----------------------------------------------

export interface GigFormData {
  eventName: string;
  date: string; // "YYYY-MM-DD"
  performers: string;
  numberOfMusicians: number;
  isCharity: boolean; // whether this is a charity/pro bono performance
  performanceFee: number;
  technicalFee: number;
  managerBonusType: "fixed" | "percentage";
  managerBonusAmount: number;
  claimPerformanceFee: boolean; // claim this fee for this gig
  claimTechnicalFee: boolean; // claim this fee for this gig
  technicalFeeClaimAmount: number | null; // amount of technical fee to claim (null = all)
  managerHandlesDistribution: boolean; // whether manager handles payment split to band members
  advanceReceivedByManager: number; // Advance amount you received from client
  advanceToMusicians: number; // Advance amount you paid to musicians
  paymentReceived: boolean;
  paymentReceivedDate: string; // "" or "YYYY-MM-DD"
  bandPaid: boolean;
  bandPaidDate: string; // "" or "YYYY-MM-DD"
  notes: string;
  bookingDate: string; // "" or "YYYY-MM-DD" - when booking was made
}

// --- Computed financial breakdown --------------------------------------------

export interface GigCalculations {
  actualManagerBonus: number;
  totalReceived: number;
  amountPerMusician: number;
  myEarnings: number;
  myEarningsAlreadyReceived: number; // Advance received from client
  myEarningsStillOwed: number; // Still owed from client (myEarnings - advance)
  amountOwedToOthers: number;
}

// --- Dashboard summary ------------------------------------------------------

export interface DashboardSummary {
  totalGigs: number;
  totalEarnings: number;
  totalEarningsReceived: number; // earnings from gigs where paymentReceived = true
  totalEarningsPending: number; // earnings from gigs where paymentReceived = false
  pendingClientPayments: number;
  outstandingToBand: number;
}

// --- User settings ----------------------------------------------------------

export interface UserSettingsData {
  currency: string;
  claimPerformanceFee: boolean;
  claimTechnicalFee: boolean;
  theme: "light" | "dark" | "system";
}

export const DEFAULT_SETTINGS: UserSettingsData = {
  currency: "EUR",
  claimPerformanceFee: true,
  claimTechnicalFee: true,
  theme: "system",
};

// --- Investment entity ------------------------------------------------------

export interface Investment {
  id: string;
  amount: number;
  description: string | null;
  date: string; // ISO string
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentFormData {
  amount: number;
  description: string;
  date: string; // "YYYY-MM-DD"
}
