// ─── Gig entity as returned by the API ───────────────────────────────────────

export interface Gig {
  id: string;
  eventName: string;
  date: string; // ISO string
  performers: string;
  numberOfMusicians: number;
  performanceFee: number;
  technicalFee: number;
  managerBonusType: "fixed" | "percentage";
  managerBonusAmount: number;
  paymentReceived: boolean;
  paymentReceivedDate: string | null;
  bandPaid: boolean;
  bandPaidDate: string | null;
  notes: string | null;
  userId: string; // belongs to this user
  createdAt: string;
  updatedAt: string;
}

// ─── User entity ──────────────────────────────────────────────────────────────

export interface User {
  id: string;
  supabaseId: string;
  email: string;
  name: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Auth session ─────────────────────────────────────────────────────────────

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

// ─── Form data sent to the API ───────────────────────────────────────────────

export interface GigFormData {
  eventName: string;
  date: string; // "YYYY-MM-DD"
  performers: string;
  numberOfMusicians: number;
  performanceFee: number;
  technicalFee: number;
  managerBonusType: "fixed" | "percentage";
  managerBonusAmount: number;
  paymentReceived: boolean;
  paymentReceivedDate: string; // "" or "YYYY-MM-DD"
  bandPaid: boolean;
  bandPaidDate: string; // "" or "YYYY-MM-DD"
  notes: string;
}

// ─── Computed financial breakdown ────────────────────────────────────────────

export interface GigCalculations {
  actualManagerBonus: number;
  totalReceived: number;
  amountPerMusician: number;
  myEarnings: number;
  amountOwedToOthers: number;
}

// ─── Dashboard summary ──────────────────────────────────────────────────────

export interface DashboardSummary {
  totalGigs: number;
  totalEarnings: number;
  pendingClientPayments: number;
  outstandingToBand: number;
}

// ─── User settings ──────────────────────────────────────────────────────────

export interface UserSettingsData {
  currency: string;
  claimPerformanceFee: boolean;
  claimTechnicalFee: boolean;
}

export const DEFAULT_SETTINGS: UserSettingsData = {
  currency: "EUR",
  claimPerformanceFee: true,
  claimTechnicalFee: true,
};
