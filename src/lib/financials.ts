/**
 * Gig-level cost accounting and band payout distribution (v1.40.0).
 *
 * This is deliberately *not* an extension of `calculateGigFinancials` in
 * `calculations.ts`. That function answers "what does the manager earn and owe",
 * from one person's point of view, and splits income. This module answers
 * "what does this gig cost, and what is each member owed from what is left" —
 * expenses come off the top before anyone is paid. The two run side by side.
 *
 * Everything here is pure. The one rule that shapes most of the code:
 *
 *   **The payouts must add up to the net, to the cent.**
 *
 * Splitting 1000 between three people gives 333.33 each and 0.01 left over.
 * Rounding that away silently loses money; handing it to one person arbitrarily
 * is unfair. `distributePayout` assigns the remainder deterministically and
 * tests assert `sum(payouts) === net` exactly.
 */

/** The four deductions taken off the gross before the band is paid. */
export interface GigExpenses {
  paExpenses?: number | null;
  travelExpenses?: number | null;
  otherExpenses?: number | null;
  commission?: number | null;
}

export interface PayoutMember {
  id: string;
  name: string;
  /** false = not in the split (guest, flat-fee player, not attending). */
  included?: boolean;
  /** Fixed euro override; null/undefined = take the computed share. */
  customAmount?: number | null;
  /** Percentage of the *distributable* pool; null/undefined = share evenly. */
  customPercent?: number | null;
}

export interface PayoutLine {
  id: string;
  name: string;
  amount: number;
  included: boolean;
  /** How this number was arrived at, for display and for tests. */
  basis: "equal" | "custom-amount" | "custom-percent" | "remainder" | "excluded";
}

export interface PayoutBreakdown {
  /** performanceFee + technicalFee, unless an override is set. */
  totalFee: number;
  totalExpenses: number;
  /** totalFee - totalExpenses. Negative when the gig lost money. */
  netProfit: number;
  /** What actually gets paid out: never negative. */
  distributable: number;
  /** Number of members sharing the pool. */
  participatingCount: number;
  /** The naive net/count, shown so rounding is explainable. */
  payoutPerMember: number;
  lines: PayoutLine[];
  /** Always exactly equal to the sum of the included lines. */
  totalPayout: number;
}

/** Coerce to a finite, non-negative money amount. */
function money(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

/**
 * Signed money, for figures that are allowed to go below zero.
 *
 * A gig that cost more than it earned really did lose money, and the net has to
 * say so. `money()` deliberately refuses negatives (a negative *expense* is a
 * data-entry slip), so the net uses this instead.
 */
function signedMoney(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Round to cents. All money in this module passes through here. */
function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * `paExpenses + travelExpenses + otherExpenses + commission`.
 *
 * Negative inputs are treated as 0 rather than credited against the bill: a
 * negative expense is a data-entry slip, and silently turning it into income
 * would inflate the payout.
 */
export function calculateTotalExpenses(expenses: GigExpenses): number {
  return cents(
    money(expenses.paExpenses) +
      money(expenses.travelExpenses) +
      money(expenses.otherExpenses) +
      money(expenses.commission)
  );
}

/**
 * The gross a gig brought in.
 *
 * `override` wins when set (>= 0); otherwise the two existing fee columns add
 * up. See the schema note on `totalFeeOverride` for why this is nullable.
 */
export function calculateTotalFee(input: {
  performanceFee?: number | null;
  technicalFee?: number | null;
  override?: number | null;
}): number {
  if (input.override !== null && input.override !== undefined && Number.isFinite(Number(input.override))) {
    return cents(money(input.override));
  }
  return cents(money(input.performanceFee) + money(input.technicalFee));
}

/** `totalFee - totalExpenses`. May be negative; that is a real loss, not an error. */
export function calculateNetProfit(totalFee: number, totalExpenses: number): number {
  return cents(signedMoney(totalFee) - cents(money(totalExpenses)));
}
/**
 * Split the net profit across the band.
 *
 * Order of precedence per member: excluded > custom amount > custom percent >
 * equal share. Custom amounts are taken off the pool first and whatever is left
 * is shared by the members still on the equal/percent path — so overriding one
 * member's amount does not silently inflate everyone else's.
 *
 * A gig that lost money pays nobody: `distributable` floors at 0 rather than
 * handing out negative payouts, while `netProfit` still reports the loss.
 */
export function distributePayout(netProfit: number, members: PayoutMember[]): PayoutBreakdown {
  const net = cents(signedMoney(netProfit));
  const distributable = net > 0 ? net : 0;

  const included = members.filter((m) => m.included !== false);
  const lines: PayoutLine[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    amount: 0,
    included: m.included !== false,
    basis: (m.included === false ? "excluded" : "equal") as PayoutLine["basis"],
  }));
  const lineFor = (id: string) => lines.find((l) => l.id === id)!;

  if (included.length === 0 || distributable === 0) {
    return {
      totalFee: 0,
      totalExpenses: 0,
      netProfit: net,
      distributable,
      participatingCount: included.length,
      payoutPerMember: 0,
      lines,
      totalPayout: 0,
    };
  }

  // 1. Fixed overrides come off the top, capped so they can never exceed the
  //    pool — a typo must not create a payout nobody earned.
  let reserved = 0;
  for (const member of included) {
    if (member.customAmount === null || member.customAmount === undefined) continue;
    const amount = cents(money(member.customAmount));
    lineFor(member.id).amount = amount;
    lineFor(member.id).basis = "custom-amount";
    reserved = cents(reserved + amount);
  }
  if (reserved > distributable) {
    // Scale the fixed amounts down to the pool rather than overpaying.
    const scale = distributable / reserved;
    for (const line of lines) {
      if (line.basis === "custom-amount") line.amount = cents(line.amount * scale);
    }
    reserved = distributable;
  }

  const remainder = cents(distributable - reserved);
  const shared = included.filter(
    (m) => lineFor(m.id).basis === "equal" || m.customPercent !== null && m.customPercent !== undefined
  );

  const withPercent = shared.filter(
    (m) => m.customPercent !== null && m.customPercent !== undefined
  );
  const percentTotal = withPercent.reduce((sum, m) => sum + money(m.customPercent), 0);
  // "Equal" here means *no percentage given*. Deriving it from `basis` instead
  // would capture the percentage members too — their basis only becomes
  // "custom-percent" further down, so they would still read as "equal" at this
  // point and the equal pass would then overwrite the percentages with zero.
  const equalMembers = shared.filter(
    (m) => m.customPercent === null || m.customPercent === undefined
  );

  if (withPercent.length > 0 && percentTotal > 0) {
    // Two readings of "50%", and the split decides which is right:
    //
    //  - Percentages are the *only* thing being allocated, so they are
    //    normalised across each other: 70/30 on €1000 is €700/€300, and a
    //    70/20 entry that sums to 90 still clears the whole pool.
    //  - Percentage members sit next to equal-share members, so "50%" has to
    //    mean 50% *of the pool*; normalising a lone 50% against itself would
    //    hand that member 100% and leave the others nothing.
    for (const member of withPercent) {
      const line = lineFor(member.id);
      line.amount =
        equalMembers.length === 0
          ? // Normalised across the percentage members themselves.
            cents((remainder * money(member.customPercent)) / percentTotal)
          : // A literal percentage of the pool.
            cents((remainder * money(member.customPercent)) / 100);
      line.basis = "custom-percent";
    }

    // Anyone on the equal path shares whatever the percentages left over.
    if (equalMembers.length > 0) {
      const taken = withPercent.reduce((sum, m) => sum + lineFor(m.id).amount, 0);
      const left = cents(Math.max(0, remainder - taken));
      const each = cents(left / equalMembers.length);
      for (const member of equalMembers) {
        lineFor(member.id).amount = each;
      }
    }
  } else if (shared.length > 0) {
    const each = cents(remainder / shared.length);
    for (const member of shared) {
      lineFor(member.id).amount = each;
    }
  }

  // 2. The leftover cents. Rounding down several ways can strand a few cents,
  //    and stranded money is money the band never gets.
  //
  //    Which line absorbs a stray cent depends on how that line was derived. A
  //    percentage member holds an exact share and must not be bumped by 1c; a
  //    fixed amount is taken off the top and must not shrink. Only the equal
  //    split is genuinely rounded, so it absorbs the drift. If nothing is on the
  //    equal path, fall back to any included line — something has to reconcile.
  const allocated = cents(lines.filter((l) => l.included).reduce((s, l) => s + l.amount, 0));
  let drift = cents(distributable - allocated);
  if (drift !== 0) {
    const step = drift > 0 ? 0.01 : -0.01;
    const equalLines = lines.filter((l) => l.included && l.basis === "equal");
    const targets = equalLines.length > 0 ? equalLines : lines.filter((l) => l.included);

    for (const target of targets) {
      if (Math.abs(drift) < 0.005) break;
      const next = cents(target.amount + step);
      if (next < 0) continue;
      target.amount = next;
      // Record it so the UI can explain why two members differ by €0.01.
      if (target.basis === "equal") target.basis = "remainder";
      drift = cents(drift - step);
    }
  }

  const totalPayout = cents(lines.filter((l) => l.included).reduce((s, l) => s + l.amount, 0));

  return {
    totalFee: 0,
    totalExpenses: 0,
    netProfit: net,
    distributable,
    participatingCount: included.length,
    payoutPerMember: cents(distributable / included.length),
    lines,
    totalPayout,
  };
}

/**
 * Full breakdown for a gig: gross → expenses → net → per-member payouts.
 *
 * `payoutPerMember` is the headline "€250 per bandlid" figure: the equal share
 * across *all* participants. It is shown next to the real per-member lines so a
 * custom split is visible rather than surprising.
 */
export function calculateGigFinancialBreakdown(input: {
  performanceFee?: number | null;
  technicalFee?: number | null;
  totalFeeOverride?: number | null;
  expenses?: GigExpenses;
  members?: PayoutMember[];
}): PayoutBreakdown {
  const totalFee = calculateTotalFee({
    performanceFee: input.performanceFee,
    technicalFee: input.technicalFee,
    override: input.totalFeeOverride,
  });
  const totalExpenses = calculateTotalExpenses(input.expenses ?? {});
  const netProfit = calculateNetProfit(totalFee, totalExpenses);

  return {
    ...distributePayout(netProfit, input.members ?? []),
    totalFee,
    totalExpenses,
    netProfit,
  };
}

/** One-line read-only summary, used by the band member view. */
export function formatPayoutHeadline(
  breakdown: PayoutBreakdown,
  format: (n: number) => string
): string {
  if (breakdown.participatingCount === 0) return "No members in the split";
  return `${format(breakdown.payoutPerMember)} per band member`;
}

