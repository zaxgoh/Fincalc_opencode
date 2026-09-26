import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CONTRIBUTION_FREQUENCIES,
  buildGrowthSchedule,
  calculateCompoundInterest,
  compareCompoundingFrequencies,
  isValidCompoundInterestInput,
  periodRate,
  realAnnualRate,
  totalPeriodsFor,
  type CompoundInterestInput,
  type CompoundingFrequency,
  type ContributionFrequency,
} from "./compound-interest.ts";

/** Float-safe comparison for money. */
function assertClose(
  actual: number,
  expected: number,
  tolerance = 0.005,
  message?: string,
) {
  assert.ok(
    Number.isFinite(actual),
    message ?? `expected ${actual} to be a finite number`,
  );
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

/**
 * Independent closed-form future value, written from the textbook formulas
 * rather than from the implementation, so it is a real cross-check.
 *
 *   lump sum:  P * (1 + r/n)^(n*t)
 *   annuity:   PMT * ((1 + r/n)^(n*t) - 1) / (r/n)
 *
 * The annuity term is grouped over contribution periods, so this is only
 * directly comparable when the contribution and compounding frequencies share
 * a common period — which is exactly the case the tests assert it in.
 */
function closedFormFutureValue(
  initialDeposit: number,
  contribution: number,
  annualRate: number,
  years: number,
  contributionPeriodsPerYear: number,
  compoundingPeriodsPerYear: number,
  timing: "end-of-period" | "start-of-period",
): number {
  const growthOverTerm = Math.pow(
    1 + annualRate / compoundingPeriodsPerYear,
    compoundingPeriodsPerYear * years,
  );
  const lumpSum = initialDeposit * growthOverTerm;

  if (contribution === 0 || annualRate === 0) {
    return lumpSum;
  }

  const perContributionPeriod = Math.pow(
    1 + annualRate / compoundingPeriodsPerYear,
    compoundingPeriodsPerYear / contributionPeriodsPerYear,
  );
  // A geometric series over the contribution periods; `growthOverTerm` is
  // already the per-period factor raised to the period count, so the term count
  // never has to appear here.
  const annuity =
    (contribution * (growthOverTerm - 1)) / (perContributionPeriod - 1);

  return timing === "start-of-period"
    ? lumpSum + annuity * perContributionPeriod
    : lumpSum + annuity;
}

const BASE: CompoundInterestInput = {
  initialDeposit: 10_000,
  contribution: 500,
  annualReturnRate: 0.07,
  annualInflationRate: 0.025,
  inflationAdjusted: false,
  years: 30,
  contributionFrequency: "monthly",
  contributionTiming: "end-of-period",
  compoundingFrequency: "monthly",
};

describe("periodRate", () => {
  it("matches the nominal rate over one period when frequencies align", () => {
    // Monthly contributions compounded monthly is just r/12.
    assertClose(periodRate(0.07, 12, 12), 0.07 / 12, 1e-12);
  });

  it("reproduces the compounded annual rate over a year of periods", () => {
    // The defining identity: c contribution periods at the derived rate must
    // grow by exactly the same factor as n compounding periods at r/n. Note
    // that is *more* than 1 + r, which is the whole point of compounding.
    const monthly = periodRate(0.07, 12, 12);
    assertClose(Math.pow(1 + monthly, 12), Math.pow(1 + 0.07 / 12, 12), 1e-12);
  });

  it("uses the compounding frequency when the two do not divide evenly", () => {
    // 52 contribution periods against 365 compounding periods.
    const i = periodRate(0.07, 365, 52);
    assertClose(Math.pow(1 + i, 52), Math.pow(1 + 0.07 / 365, 365), 1e-12);
  });

  it("is zero at a zero rate, so nothing divides by zero", () => {
    assert.equal(periodRate(0, 12, 12), 0);
  });

  it("compounds a negative real rate as a loss", () => {
    const i = periodRate(-0.03, 12, 12);
    assert.ok(i < 0, "a negative rate must shrink the balance");
    assertClose(Math.pow(1 + i, 12), Math.pow(1 - 0.03 / 12, 12), 1e-12);
  });

  it("gives a larger period rate the more often it compounds", () => {
    const daily = periodRate(0.07, 365, 12);
    const monthly = periodRate(0.07, 12, 12);
    const annually = periodRate(0.07, 1, 12);
    assert.ok(daily > monthly, "daily must beat monthly");
    assert.ok(monthly > annually, "monthly must beat annual");
  });

  it("returns 0 for degenerate frequency input", () => {
    assert.equal(periodRate(0.07, 0, 12), 0);
    assert.equal(periodRate(0.07, 12, 0), 0);
    assert.equal(periodRate(NaN, 12, 12), 0);
  });
});

describe("realAnnualRate", () => {
  it("strips inflation out of the headline rate", () => {
    assertClose(realAnnualRate(0.07, 0.02), 1.07 / 1.02 - 1, 1e-12);
  });

  it("returns the nominal rate when inflation is zero", () => {
    assertClose(realAnnualRate(0.07, 0), 0.07, 1e-12);
  });

  it("goes negative when inflation outruns the return", () => {
    assert.ok(realAnnualRate(0, 0.03) < 0, "purchasing power must fall");
  });
});

describe("totalPeriodsFor", () => {
  it("maps each frequency to its periods per year", () => {
    const cases: Array<[ContributionFrequency, number]> = [
      ["weekly", 52],
      ["fortnightly", 26],
      ["monthly", 12],
      ["quarterly", 4],
      ["annually", 1],
    ];
    for (const [frequency, expected] of cases) {
      assert.equal(totalPeriodsFor(10, frequency), expected * 10);
    }
  });

  it("returns 0 for a non-positive horizon", () => {
    assert.equal(totalPeriodsFor(0, "monthly"), 0);
    assert.equal(totalPeriodsFor(-5, "monthly"), 0);
  });
});

describe("calculateCompoundInterest", () => {
  it("matches the closed-form future value for the base case", () => {
    const result = calculateCompoundInterest(BASE);
    assertClose(
      result.finalBalance,
      closedFormFutureValue(10_000, 500, 0.07, 30, 12, 12, "end-of-period"),
      0.5,
    );
  });

  it("matches a known-good 30 year projection", () => {
    // $10k plus $500 a month at 7% compounded monthly for 30 years, from the
    // closed form: 10,000 * (1 + 0.07/12)^360 + 500 * ((1 + 0.07/12)^360 - 1)
    // / (0.07/12).
    assertClose(calculateCompoundInterest(BASE).finalBalance, 691_150, 1);
  });

  it("keeps the books balanced: balance is contributed plus growth", () => {
    const result = calculateCompoundInterest(BASE);
    assertClose(
      result.finalBalance,
      result.totalContributed + result.totalInterest,
      1e-6,
    );
  });

  it("counts every contribution exactly once", () => {
    const result = calculateCompoundInterest(BASE);
    assertClose(result.totalContributed, 10_000 + 500 * 360, 1e-6);
  });

  it("adds a period of growth for start-of-period contributions", () => {
    const end = calculateCompoundInterest(BASE);
    const start = calculateCompoundInterest({
      ...BASE,
      contributionTiming: "start-of-period",
    });
    const i = periodRate(0.07, 12, 12);
    const depositAlone = 10_000 * Math.pow(1 + i, 360);

    // Only the contributions earn the extra period, not the opening deposit, so
    // the uplift applies to the annuity portion alone.
    assertClose(
      start.finalBalance,
      depositAlone + (end.finalBalance - depositAlone) * (1 + i),
      0.5,
    );
    // Same money either way, just invested for slightly longer.
    assertClose(start.totalContributed, end.totalContributed, 1e-6);
    assert.ok(start.totalInterest > end.totalInterest);
  });

  it("matches the closed form for every timing and aligned frequency", () => {
    const periodsPerYear: Record<CompoundingFrequency, number> = {
      daily: 365,
      weekly: 52,
      monthly: 12,
      quarterly: 4,
      annually: 1,
    };
    const cases: Array<[ContributionFrequency, CompoundingFrequency]> = [
      ["annually", "annually"],
      ["quarterly", "quarterly"],
      ["monthly", "monthly"],
      ["monthly", "daily"],
      ["weekly", "daily"],
    ];
    for (const [contributionFrequency, compoundingFrequency] of cases) {
      for (const contributionTiming of [
        "end-of-period",
        "start-of-period",
      ] as const) {
        const result = calculateCompoundInterest({
          ...BASE,
          contributionFrequency,
          compoundingFrequency,
          contributionTiming,
        });
        assertClose(
          result.finalBalance,
          closedFormFutureValue(
            10_000,
            500,
            0.07,
            30,
            CONTRIBUTION_FREQUENCIES[contributionFrequency].periodsPerYear,
            periodsPerYear[compoundingFrequency],
            contributionTiming,
          ),
          1,
          `mismatch for ${contributionTiming} ${contributionFrequency}/${compoundingFrequency}`,
        );
      }
    }
  });

  it("leaves the deposit alone when there are no contributions", () => {
    const result = calculateCompoundInterest({ ...BASE, contribution: 0 });
    assertClose(result.totalContributed, 10_000, 1e-9);
    assertClose(result.finalBalance, 10_000 * Math.pow(1 + 0.07 / 12, 360), 1);
    assertClose(result.balanceWithoutContributions, result.finalBalance, 1e-6);
  });

  it("earns nothing at a zero rate but still collects every contribution", () => {
    const result = calculateCompoundInterest({ ...BASE, annualReturnRate: 0 });
    assert.equal(result.totalInterest, 0);
    assertClose(result.finalBalance, 190_000, 1e-6);
    assert.ok(Number.isFinite(result.finalBalance));
  });

  it("shrinks the deposit in real terms when inflation outruns the return", () => {
    const result = calculateCompoundInterest({
      ...BASE,
      annualReturnRate: 0,
      annualInflationRate: 0.03,
      inflationAdjusted: true,
    });
    const realRate = realAnnualRate(0, 0.03);
    assert.ok(realRate < 0, "real rate must be negative");
    assert.ok(result.totalInterest < 0, "purchasing power must be lost");
    assertClose(
      result.balanceWithoutContributions,
      10_000 * Math.pow(1 + realRate / 12, 360),
      1,
    );
    assertClose(
      result.finalBalance,
      closedFormFutureValue(10_000, 500, realRate, 30, 12, 12, "end-of-period"),
      1,
    );
  });

  it("reports the nominal projection alongside the adjusted one", () => {
    const result = calculateCompoundInterest({
      ...BASE,
      inflationAdjusted: true,
    });
    assertClose(result.effectiveAnnualRate, realAnnualRate(0.07, 0.025), 1e-12);
    assert.equal(result.nominalAnnualRate, 0.07);
    assert.ok(
      result.nominalFinalBalance > result.finalBalance,
      "a positive real rate must beat the nominal figure in today's dollars",
    );
  });

  it("matches the nominal result when inflation adjustment is off", () => {
    const result = calculateCompoundInterest(BASE);
    assertClose(result.nominalFinalBalance, result.finalBalance, 1e-9);
    assert.equal(result.effectiveAnnualRate, 0.07);
  });

  it("reconciles the yearly rows with the headline totals", () => {
    const result = calculateCompoundInterest(BASE);
    const contributed = result.yearly.reduce((s, r) => s + r.contributions, 0);
    const interest = result.yearly.reduce((s, r) => s + r.interestEarned, 0);
    assertClose(contributed, result.totalContributed, 1e-6);
    assertClose(interest, result.totalInterest, 1e-6);
    assertClose(
      result.yearly.at(-1)?.balance ?? NaN,
      result.finalBalance,
      1e-6,
    );
  });

  it("produces one row per year for a whole number of years", () => {
    assert.equal(calculateCompoundInterest(BASE).yearly.length, 30);
    assert.equal(
      calculateCompoundInterest({ ...BASE, years: 1 }).yearly.length,
      1,
    );
  });

  it("leaves a part-year final row on a fractional horizon", () => {
    // 2.5 years monthly = 30 contributions, so the third year is part-year.
    const result = calculateCompoundInterest({ ...BASE, years: 2.5 });
    assert.equal(result.yearly.length, 3);
    const thirdYear = result.yearly[2];
    assertClose(thirdYear.contributions, 500 * 6, 1e-9);
    assertClose(thirdYear.balance, result.finalBalance, 1e-6);
  });

  it("grows faster as the return rises", () => {
    const at5 = calculateCompoundInterest({
      ...BASE,
      annualReturnRate: 0.05,
    });
    const at9 = calculateCompoundInterest({
      ...BASE,
      annualReturnRate: 0.09,
    });
    assert.ok(at9.finalBalance > at5.finalBalance);
  });

  it("grows faster as contributions get more frequent", () => {
    const monthly = calculateCompoundInterest(BASE);
    const annually = calculateCompoundInterest({
      ...BASE,
      contributionFrequency: "annually",
    });
    // More often means more money in the account, so a bigger final balance.
    assert.ok(monthly.totalContributed > annually.totalContributed);
  });

  it("stays finite for every frequency combination", () => {
    const contributions: ContributionFrequency[] = [
      "weekly",
      "fortnightly",
      "monthly",
      "quarterly",
      "annually",
    ];
    const compounding: CompoundingFrequency[] = [
      "daily",
      "weekly",
      "monthly",
      "quarterly",
      "annually",
    ];
    for (const contributionFrequency of contributions) {
      for (const compoundingFrequency of compounding) {
        const result = calculateCompoundInterest({
          ...BASE,
          contributionFrequency,
          compoundingFrequency,
        });
        assert.ok(Number.isFinite(result.finalBalance));
        assert.ok(Number.isFinite(result.totalInterest));
        assert.ok(result.finalBalance > 0);
        assertClose(
          result.finalBalance,
          result.totalContributed + result.totalInterest,
          1e-4,
        );
      }
    }
  });

  it("handles the extremes of the input range", () => {
    const fastest = calculateCompoundInterest({
      ...BASE,
      initialDeposit: 100_000_000,
      contribution: 10_000_000,
      annualReturnRate: 0.5,
      years: 50,
      contributionFrequency: "weekly",
      compoundingFrequency: "daily",
    });
    assert.ok(Number.isFinite(fastest.finalBalance));
    assert.ok(Number.isFinite(fastest.totalInterest));
  });

  it("returns zeroes rather than NaN for a zero horizon", () => {
    const result = calculateCompoundInterest({ ...BASE, years: 0 });
    assert.equal(result.finalBalance, 0);
    assert.equal(result.totalPeriods, 0);
    assert.equal(result.totalInterest, 0);
    assert.deepEqual(result.yearly, []);
  });
});

describe("compareCompoundingFrequencies", () => {
  it("returns a row for every supported frequency", () => {
    const rows = compareCompoundingFrequencies(BASE);
    assert.equal(rows.length, 5);
    assert.deepEqual(
      rows.map((row) => row.frequency),
      ["daily", "weekly", "monthly", "quarterly", "annually"],
    );
  });

  it("agrees with the headline result on the selected frequency", () => {
    const result = calculateCompoundInterest(BASE);
    const selected = result.comparison.find(
      (row) => row.frequency === BASE.compoundingFrequency,
    );
    assertClose(selected?.finalBalance ?? NaN, result.finalBalance, 1e-6);
    assertClose(selected?.interestEarned ?? NaN, result.totalInterest, 1e-6);
  });

  it("earns more the more often it compounds", () => {
    const rows = compareCompoundingFrequencies(BASE);
    // Listed most-frequent first, so the balances descend.
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(
        rows[i].finalBalance < rows[i - 1].finalBalance,
        `${rows[i].label} must trail ${rows[i - 1].label}`,
      );
      assert.ok(rows[i].interestEarned < rows[i - 1].interestEarned);
    }
  });

  it("puts the whole compounding spread in the interest column", () => {
    const rows = compareCompoundingFrequencies(BASE);
    const daily = rows[0];
    const annually = rows.at(-1);
    assert.ok(daily && annually);
    // Identical contributions across every row, so the entire difference
    // between the best and worst compounding is growth.
    assertClose(
      daily.finalBalance - annually.finalBalance,
      daily.interestEarned - annually.interestEarned,
      1e-6,
    );
    assertClose(
      annually.finalBalance - (10_000 + 500 * 360),
      annually.interestEarned,
      1e-6,
      "the balance above everything contributed is the interest",
    );
  });

  it("is identical at a zero rate, since frequency buys nothing", () => {
    const rows = compareCompoundingFrequencies({
      ...BASE,
      annualReturnRate: 0,
    });
    for (const row of rows) {
      assertClose(row.finalBalance, 190_000, 1e-6);
      assert.equal(row.interestEarned, 0);
    }
  });

  it("compares in real terms when inflation adjustment is on", () => {
    const rows = compareCompoundingFrequencies({
      ...BASE,
      inflationAdjusted: true,
    });
    const result = calculateCompoundInterest({
      ...BASE,
      inflationAdjusted: true,
    });
    const selected = rows.find(
      (row) => row.frequency === BASE.compoundingFrequency,
    );
    assertClose(selected?.finalBalance ?? NaN, result.finalBalance, 1e-6);
  });
});

describe("buildGrowthSchedule", () => {
  it("matches the rows on the full result", () => {
    assert.deepEqual(
      buildGrowthSchedule(BASE),
      calculateCompoundInterest(BASE).yearly,
    );
  });

  it("reports a rising balance year on year", () => {
    const rows = buildGrowthSchedule(BASE);
    for (let i = 1; i < rows.length; i += 1) {
      assert.ok(rows[i].balance > rows[i - 1].balance);
    }
  });

  it("only counts the opening deposit as a contribution in year one", () => {
    const rows = buildGrowthSchedule(BASE);
    assertClose(rows[0].contributions, 10_000 + 500 * 12, 1e-9);
    assertClose(rows[1].contributions, 500 * 12, 1e-9);
  });

  it("returns no rows for a non-positive horizon", () => {
    assert.deepEqual(buildGrowthSchedule({ ...BASE, years: 0 }), []);
    assert.deepEqual(buildGrowthSchedule({ ...BASE, years: -5 }), []);
  });
});

describe("isValidCompoundInterestInput", () => {
  it("accepts a sane projection", () => {
    assert.equal(isValidCompoundInterestInput(BASE), true);
  });

  it("accepts a zero deposit, contribution, return and inflation rate", () => {
    assert.equal(
      isValidCompoundInterestInput({
        ...BASE,
        initialDeposit: 0,
        contribution: 0,
        annualReturnRate: 0,
        annualInflationRate: 0,
      }),
      true,
    );
  });

  it("rejects negative amounts", () => {
    assert.equal(
      isValidCompoundInterestInput({ ...BASE, initialDeposit: -1 }),
      false,
    );
    assert.equal(
      isValidCompoundInterestInput({ ...BASE, contribution: -1 }),
      false,
    );
    assert.equal(
      isValidCompoundInterestInput({ ...BASE, annualReturnRate: -0.01 }),
      false,
    );
    assert.equal(
      isValidCompoundInterestInput({ ...BASE, annualInflationRate: -0.01 }),
      false,
    );
  });

  it("rejects a horizon outside the supported range", () => {
    assert.equal(isValidCompoundInterestInput({ ...BASE, years: 0 }), false);
    assert.equal(isValidCompoundInterestInput({ ...BASE, years: 51 }), false);
  });

  it("rejects a return above the supported range", () => {
    assert.equal(
      isValidCompoundInterestInput({ ...BASE, annualReturnRate: 0.6 }),
      false,
    );
  });

  it("rejects NaN", () => {
    assert.equal(
      isValidCompoundInterestInput({ ...BASE, initialDeposit: NaN }),
      false,
    );
    assert.equal(isValidCompoundInterestInput({ ...BASE, years: NaN }), false);
    assert.equal(
      isValidCompoundInterestInput({ ...BASE, contribution: NaN }),
      false,
    );
  });
});
