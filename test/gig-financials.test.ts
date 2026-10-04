import { describe, expect, it } from "vitest";
import {
  calculateGigFinancialBreakdown,
  calculateNetProfit,
  calculateTotalExpenses,
  calculateTotalFee,
  distributePayout,
  formatPayoutHeadline,
  type PayoutMember,
} from "@/lib/financials";

const members = (...names: string[]): PayoutMember[] =>
  names.map((name, i) => ({ id: `m${i}`, name }));

const sumIncluded = (lines: Array<{ amount: number; included: boolean }>) =>
  Math.round(lines.filter((l) => l.included).reduce((s, l) => s + l.amount, 0) * 100) / 100;

describe("calculateTotalExpenses", () => {
  it("adds all four deductions", () => {
    expect(
      calculateTotalExpenses({
        paExpenses: 100,
        travelExpenses: 50.5,
        otherExpenses: 25.25,
        commission: 10,
      })
    ).toBe(185.75);
  });

  it("is zero when nothing is set", () => {
    expect(calculateTotalExpenses({})).toBe(0);
  });

  it("treats missing, null and non-numeric values as zero", () => {
    expect(calculateTotalExpenses({ paExpenses: null, travelExpenses: undefined })).toBe(0);
    expect(calculateTotalExpenses({ commission: Number.NaN })).toBe(0);
    expect(calculateTotalExpenses({ otherExpenses: Infinity })).toBe(0);
  });

  it("never credits a negative expense against the bill", () => {
    // A negative expense is a data-entry slip; treating it as income would
    // inflate the payout.
    expect(calculateTotalExpenses({ paExpenses: -500, otherExpenses: 20 })).toBe(20);
  });
});

describe("calculateTotalFee", () => {
  it("adds performance and technical fees", () => {
    expect(calculateTotalFee({ performanceFee: 500, technicalFee: 100 })).toBe(600);
  });

  it("uses the override when one is set", () => {
    expect(calculateTotalFee({ performanceFee: 500, technicalFee: 100, override: 750 })).toBe(750);
  });

  it("derives from the fees when the override is null", () => {
    expect(calculateTotalFee({ performanceFee: 500, technicalFee: 100, override: null })).toBe(600);
  });

  it("treats an explicit zero override as a real zero", () => {
    // 0 is a value, not "unset" — a free benefit gig is a real thing.
    expect(calculateTotalFee({ performanceFee: 500, override: 0 })).toBe(0);
  });
});

describe("calculateNetProfit", () => {
  it("is fee minus expenses", () => {
    expect(calculateNetProfit(1000, 400)).toBe(600);
  });

  it("goes negative when costs exceed the fee", () => {
    expect(calculateNetProfit(300, 450)).toBe(-150);
  });

  it("is exactly zero for a break-even gig", () => {
    expect(calculateNetProfit(400, 400)).toBe(0);
  });
});

describe("distributePayout — equal splits", () => {
  it("splits evenly and reconciles exactly", () => {
    const result = distributePayout(1000, members("Ann", "Ben", "Cas"));
    expect(result.lines.map((l) => l.amount)).toEqual([333.34, 333.33, 333.33]);
    expect(sumIncluded(result.lines)).toBe(1000);
    expect(result.totalPayout).toBe(1000);
  });

  it("splits a clean division without inventing cents", () => {
    const result = distributePayout(900, members("Ann", "Ben", "Cas"));
    expect(result.lines.map((l) => l.amount)).toEqual([300, 300, 300]);
    expect(sumIncluded(result.lines)).toBe(900);
  });

  it("never loses or invents money across awkward divisions", () => {
    // The whole point of the remainder pass: these are the shapes that used to
    // leave a few cents stranded.
    for (const [net, count] of [
      [1000, 3],
      [100, 7],
      [10, 3],
      [1, 3],
      [1000.01, 6],
      [0.03, 2],
    ] as const) {
      const result = distributePayout(
        net,
        members(...Array.from({ length: count }, (_, i) => `M${i}`))
      );
      expect(sumIncluded(result.lines)).toBe(Math.round(net * 100) / 100);
    }
  });

  it("reports the headline per-member figure", () => {
    const result = distributePayout(1000, members("Ann", "Ben", "Cas"));
    expect(result.participatingCount).toBe(3);
    expect(result.payoutPerMember).toBe(333.33);
  });
});
describe("distributePayout — edge cases", () => {
  it("pays nobody on a zero fee and does not divide by zero", () => {
    const result = distributePayout(0, members("Ann", "Ben"));
    expect(result.lines.every((l) => l.amount === 0)).toBe(true);
    expect(result.payoutPerMember).toBe(0);
    expect(result.totalPayout).toBe(0);
    expect(Number.isFinite(result.payoutPerMember)).toBe(true);
  });

  it("pays nobody on a loss but still reports the loss", () => {
    const result = distributePayout(-150, members("Ann", "Ben"));
    expect(result.netProfit).toBe(-150);
    expect(result.distributable).toBe(0);
    expect(result.lines.every((l) => l.amount === 0)).toBe(true);
    // No negative payouts: a member is never billed for the gig.
    expect(result.lines.every((l) => l.amount >= 0)).toBe(true);
  });

  it("survives an empty band", () => {
    const result = distributePayout(1000, []);
    expect(result.participatingCount).toBe(0);
    expect(result.lines).toEqual([]);
    expect(result.totalPayout).toBe(0);
    expect(Number.isNaN(result.payoutPerMember)).toBe(false);
  });

  it("gives excluded members nothing", () => {
    const roster: PayoutMember[] = [
      { id: "a", name: "Ann" },
      { id: "b", name: "Ben", included: false },
      { id: "c", name: "Cas" },
    ];
    const result = distributePayout(300, roster);
    expect(result.lines.find((l) => l.id === "b")!.amount).toBe(0);
    expect(result.lines.find((l) => l.id === "b")!.basis).toBe("excluded");
    // The pool goes to the two who are actually in the split.
    expect(result.lines.find((l) => l.id === "a")!.amount).toBe(150);
    expect(sumIncluded(result.lines)).toBe(300);
  });

  it("pays nobody when everyone is excluded", () => {
    const roster: PayoutMember[] = [{ id: "a", name: "Ann", included: false }];
    const result = distributePayout(300, roster);
    expect(result.participatingCount).toBe(0);
    expect(result.totalPayout).toBe(0);
  });
});

describe("distributePayout — custom splits", () => {
  it("takes a fixed amount off the top and shares the rest", () => {
    const roster: PayoutMember[] = [
      { id: "a", name: "Ann", customAmount: 200 },
      { id: "b", name: "Ben" },
      { id: "c", name: "Cas" },
    ];
    const result = distributePayout(600, roster);
    expect(result.lines.find((l) => l.id === "a")!.amount).toBe(200);
    expect(result.lines.find((l) => l.id === "a")!.basis).toBe("custom-amount");
    expect(result.lines.find((l) => l.id === "b")!.amount).toBe(200);
    expect(sumIncluded(result.lines)).toBe(600);
  });

  it("caps fixed amounts that would exceed the pool", () => {
    const roster: PayoutMember[] = [
      { id: "a", name: "Ann", customAmount: 900 },
      { id: "b", name: "Ben", customAmount: 900 },
    ];
    const result = distributePayout(1000, roster);
    // Scaled down to the pool rather than overpaying by €800.
    expect(sumIncluded(result.lines)).toBe(1000);
    expect(result.lines.every((l) => l.amount <= 1000)).toBe(true);
  });

  it("normalises percentages that do not total 100", () => {
    const roster: PayoutMember[] = [
      { id: "a", name: "Ann", customPercent: 70 },
      { id: "b", name: "Ben", customPercent: 30 },
    ];
    const result = distributePayout(1000, roster);
    expect(result.lines.find((l) => l.id === "a")!.amount).toBe(700);
    expect(result.lines.find((l) => l.id === "b")!.amount).toBe(300);
  });

  it("normalises percentages that total less than 100", () => {
    // 70/20 summing to 90 must still pay out the whole pool.
    const roster: PayoutMember[] = [
      { id: "a", name: "Ann", customPercent: 70 },
      { id: "b", name: "Ben", customPercent: 20 },
    ];
    const result = distributePayout(1000, roster);
    expect(sumIncluded(result.lines)).toBe(1000);
  });

  it("mixes a percentage with equal shares", () => {
    const roster: PayoutMember[] = [
      { id: "a", name: "Ann", customPercent: 50 },
      { id: "b", name: "Ben" },
      { id: "c", name: "Cas" },
    ];
    const result = distributePayout(600, roster);
    expect(result.lines.find((l) => l.id === "a")!.amount).toBe(300);
    expect(result.lines.find((l) => l.id === "b")!.amount).toBe(150);
    expect(result.lines.find((l) => l.id === "c")!.amount).toBe(150);
    expect(sumIncluded(result.lines)).toBe(600);
  });

  it("ignores a zero total percentage rather than paying nobody", () => {
    const roster: PayoutMember[] = [
      { id: "a", name: "Ann", customPercent: 0 },
      { id: "b", name: "Ben", customPercent: 0 },
    ];
    const result = distributePayout(600, roster);
    expect(sumIncluded(result.lines)).toBe(600);
  });
});

describe("calculateGigFinancialBreakdown", () => {
  it("walks gross → expenses → net → payouts", () => {
    const result = calculateGigFinancialBreakdown({
      performanceFee: 800,
      technicalFee: 200,
      expenses: { paExpenses: 150, travelExpenses: 100, commission: 50 },
      members: members("Ann", "Ben", "Cas", "Dee"),
    });
    expect(result.totalFee).toBe(1000);
    expect(result.totalExpenses).toBe(300);
    expect(result.netProfit).toBe(700);
    expect(result.payoutPerMember).toBe(175);
    expect(result.lines.every((l) => l.amount === 175)).toBe(true);
    expect(result.totalPayout).toBe(700);
  });

  it("reports a losing gig honestly", () => {
    const result = calculateGigFinancialBreakdown({
      performanceFee: 200,
      expenses: { travelExpenses: 500 },
      members: members("Ann", "Ben"),
    });
    expect(result.totalFee).toBe(200);
    expect(result.totalExpenses).toBe(500);
    expect(result.netProfit).toBe(-300);
    expect(result.totalPayout).toBe(0);
    expect(result.lines.every((l) => l.amount === 0)).toBe(true);
  });

  it("works with no members attached yet", () => {
    const result = calculateGigFinancialBreakdown({ performanceFee: 500, members: [] });
    expect(result.netProfit).toBe(500);
    expect(result.participatingCount).toBe(0);
    expect(Number.isNaN(result.payoutPerMember)).toBe(false);
  });

  it("honours a gross override end to end", () => {
    const result = calculateGigFinancialBreakdown({
      performanceFee: 800,
      technicalFee: 200,
      totalFeeOverride: 1200,
      expenses: { otherExpenses: 200 },
      members: members("Ann", "Ben"),
    });
    expect(result.totalFee).toBe(1200);
    expect(result.netProfit).toBe(1000);
    expect(result.payoutPerMember).toBe(500);
  });
});

describe("formatPayoutHeadline", () => {
  const eur = (n: number) => `€${n.toFixed(2)}`;

  it("summarises the per-member figure", () => {
    expect(formatPayoutHeadline(distributePayout(600, members("Ann", "Ben")), eur)).toBe(
      "€300.00 per band member"
    );
  });

  it("says so when nobody is in the split", () => {
    expect(formatPayoutHeadline(distributePayout(600, []), eur)).toBe("No members in the split");
  });
});
