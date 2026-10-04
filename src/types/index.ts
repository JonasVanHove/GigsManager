// --- Gig entity as returned by the API ---------------------------------------

export interface Gig {
  id: string;
  eventName: string;
  date: string; // ISO string
  performers: string;
  numberOfMusicians: number;
  performanceLineup: string | null;
  managerPerforms: boolean;
  isCharity: boolean; // whether this is a charity/pro bono performance
  isTentative: boolean; // provisional booking, not yet definitive
  isFinancialHidden?: boolean; // hide fees/payouts from bandmates shared on this gig
  // --- Gig-level cost accounting (v1.40.0) ---
  paExpenses?: number; // sound & lighting
  travelExpenses?: number; // transport / fuel
  otherExpenses?: number; // anything else
  commission?: number; // booking agent fee
  /** null/undefined = derive the gross from performanceFee + technicalFee. */
  totalFeeOverride?: number | null;
  performanceFee: number;
  performanceFeeUnknown: boolean; // true when fee is still unknown
  technicalFee: number;
  managerBonusType: "fixed" | "percentage";
  managerBonusAmount: number;
  performanceDistribution: "equal" | "managerFixed" | "custom"; // how to split performance fee
  managerPerformanceAmount: number | null; // if managerFixed: amount manager claims
  claimPerformanceFee: boolean; // claim this fee for this gig
  claimTechnicalFee: boolean; // claim this fee for this gig
  technicalFeeClaimAmount: number | null; // amount of technical fee to claim (null = all)
  managerHandlesDistribution: boolean; // whether manager handles payment split to band members
  paymentReceived: boolean;
  paymentReceivedDate: string | null;
  managerInstantPayment: boolean; // manager pays/handles payment immediately
  bandPaid: boolean;
  bandPaidDate: string | null;
  advanceReceivedByManager: number; // Advance amount you received from client
  advanceToMusicians: number; // Advance amount you paid to musicians
  notes: string | null;
  bookingDate: string; // ISO string - when booking was made
  userId: string; // belongs to this user
  setlistId: string | null;
  // --- Logistics (drives the AI schedule generator) ---
  venueName?: string | null;
  venueLocation?: string | null;
  /** "HH:MM" local to the venue. */
  soundcheckTime?: string | null;
  doorsOpenTime?: string | null;
  performanceDurationMinutes?: number | null;
  gearSetupNotes?: string | null;
  // --- Organizer / technician contact ---
  organizerName?: string | null;
  organizerEmail?: string | null;
  organizerPhone?: string | null;
  bandId?: string | null;
  /** Set by the API from band-sharing: this viewer may edit the gig. Absent means unknown. */
  canEdit?: boolean;
  band?: {
    id: string;
    name: string;
    color?: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

// --- User entity --------------------------------------------------------------

export interface User {
  id: string;
  supabaseId: string;
  email: string;
  name: string | null;
  superAdmin: boolean;
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
      avatar_url?: string;
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
  performanceLineup: string;
  managerPerforms: boolean;
  isCharity: boolean; // whether this is a charity/pro bono performance
  isTentative: boolean; // provisional booking, not yet definitive
  isFinancialHidden?: boolean; // hide fees/payouts from bandmates shared on this gig
  // --- Gig-level cost accounting (v1.40.0) ---
  paExpenses?: number; // sound & lighting
  travelExpenses?: number; // transport / fuel
  otherExpenses?: number; // anything else
  commission?: number; // booking agent fee
  /** null/undefined = derive the gross from performanceFee + technicalFee. */
  totalFeeOverride?: number | null;
  performanceFee: number;
  performanceFeeUnknown: boolean; // true when fee is still unknown
  technicalFee: number;
  managerBonusType: "fixed" | "percentage";
  managerBonusAmount: number;
  performanceDistribution: "equal" | "managerFixed" | "custom"; // how to split performance fee
  managerPerformanceAmount: number | null; // if managerFixed: amount manager claims
  claimPerformanceFee: boolean; // claim this fee for this gig
  claimTechnicalFee: boolean; // claim this fee for this gig
  technicalFeeClaimAmount: number | null; // amount of technical fee to claim (null = all)
  managerHandlesDistribution: boolean; // whether manager handles payment split to band members
  advanceReceivedByManager: number; // Advance amount you received from client
  advanceToMusicians: number; // Advance amount you paid to musicians
  paymentReceived: boolean;
  paymentReceivedDate: string; // "" or "YYYY-MM-DD"
  managerInstantPayment: boolean; // manager pays/handles payment immediately
  bandPaid: boolean;
  bandPaidDate: string; // "" or "YYYY-MM-DD"
  notes: string;
  bookingDate: string; // "" or "YYYY-MM-DD" - when booking was made
  bandMemberIds?: string[];
  setlistId?: string | null;
  bandId?: string | null;
  // --- Logistics (drive the AI schedule generator) ---
  venueName?: string;
  venueLocation?: string;
  soundcheckTime?: string; // "HH:MM"
  doorsOpenTime?: string; // "HH:MM"
  performanceDurationMinutes?: number | null;
  gearSetupNotes?: string;
  // --- Organizer / technician contact ---
  organizerName?: string;
  organizerEmail?: string;
  organizerPhone?: string;
}

// --- Setlists --------------------------------------------------------------

export interface SetlistItem {
  id: string;
  setlistId: string;
  order: number;
  type: "song" | "note";
  title: string | null;
  notes: string | null;
  chords: string | null;
  tuning: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Setlist {
  id: string;
  title: string;
  description: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
  items?: SetlistItem[];
  gigs?: Gig[];
}

// --- Computed financial breakdown --------------------------------------------

export interface GigCalculations {
  actualManagerBonus: number;
  totalReceived: number;
  perfShare: number;
  techShare: number;
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
  pendingByBand: Array<{
    band: string;
    amount: number;
    count: number;
  }>;
}

// --- User settings ----------------------------------------------------------

export interface UserSettingsData {
  currency: string;
  claimPerformanceFee: boolean;
  claimTechnicalFee: boolean;
  theme: "light" | "dark" | "system";
  // Custom Navigation Tabs
  customTab1?: string;
  customTab2?: string;
  // Overview (Dashboard) view mode: 'grid' (card grid) or 'compact' (dense list)
  overviewViewMode?: "grid" | "compact";
  // PDF Export Settings
  pdfIncludeLogo?: boolean;
  pdfFont?: string;
  pdfPageSize?: string;
  pdfPageBreakMode?: string;
  pdfDarkMode?: boolean;
  pdfShowHeaders?: boolean;
  pdfShowMetadata?: boolean;
  pdfImagesOnly?: boolean;
  pdfShowPageNumbers?: boolean;
  pdfMarginSize?: string;
  // Band Settings
  excludeSelfFromMemberCount?: boolean;
}

export type AppLanguage = "system" | "en" | "nl";

export const DEFAULT_SETTINGS: UserSettingsData = {
  currency: "EUR",
  claimPerformanceFee: true,
  claimTechnicalFee: true,
  theme: "system",
  customTab1: "setlists",
  customTab2: "songs",
  overviewViewMode: "grid",
  pdfIncludeLogo: true,
  pdfFont: "inter",
  pdfPageSize: "a4",
  pdfPageBreakMode: "auto",
  pdfDarkMode: false,
  pdfShowHeaders: true,
  pdfShowMetadata: true,
  pdfImagesOnly: false,
  pdfShowPageNumbers: true,
  pdfMarginSize: "medium",
  excludeSelfFromMemberCount: false,
};

// --- Investment entity ------------------------------------------------------

export interface Investment {
  id: string;
  amount: number;
  sharedWithMusician: boolean;
  description: string | null;
  date: string; // ISO string
  userId: string;
  contributors?: InvestmentContributor[];
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentContributor {
  id: string;
  bandMemberId: string;
  bandMember: {
    id: string;
    name: string;
  };
}

export interface InvestmentFormData {
  amount: number;
  sharedWithMusician: boolean;
  contributorIds: string[];
  description: string;
  date: string; // "YYYY-MM-DD"
}

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

export interface ShareLinkItem {
  id: string;
  token: string;
  title: string | null;
  createdAt: string;
  expiresAt: string | null;
  passwordProtected: boolean;
  gigCount: number;
  selectionMode?: "all" | "artist" | "individual";
  includeArtists?: string[];
  autoIncludeNewGigs?: boolean;
  visibility?: ShareLinkVisibility;
  isExpired?: boolean;
}

export interface PublicSharedGig {
  eventName: string | null;
  gigDate: string | null;
  bookingDate: string | null;
  performers: string | null;
  notes: string | null;
  performanceFee: number | null;
  perMusicianShare: number | null;
  managerEarnings: number | null;
  managerBonus: number | null;
  technicalFee: number | null;
  totalCost: number | null;
  clientPaymentStatus: "received" | "pending" | null;
  bandPaymentStatus: "paid" | "pending" | null;
  isCharity?: boolean;
  isTentative?: boolean;
}

// --- Songs / Notes ------------------------------------------------------
export interface SongAttachment {
  id: string;
  storagePath: string;
  publicUrl: string;
  contentType: string;
  caption?: string | null;
}

export interface Song {
  id: string;
  title: string;
  notes: string | null;
  date: string;
  userId: string;
  attachments?: SongAttachment[];
  createdAt: string;
  updatedAt: string;
}
