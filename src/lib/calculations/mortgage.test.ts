import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildSchedule,
  calculateMortgage,
  calculatePeriodicRepayment,
  clamp,
  isValidMortgageInput,
  summariseByYear,
  totalPaymentsFor,
  type MortgageInput,
  type RepaymentFrequency,
} from "./mortgage.ts";

/** Float-safe comparison for money. */
function assertClose(
  actual: number,
  expected: number,
  tolerance = 0.005,
  message?: string,
) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message ?? `expected ${actual} to be within ${tolerance} of ${expected}`,
  );
}

const BASE: MortgageInput = {
  principal: 400_000,
  annualInterestRate: 0.065,
  termYears: 30,
  frequency: "monthly",
  type: "principal-and-interest",
};

describe("calculatePeriodicRepayment", () => {
  it("matches a known-good amortising repayment", () => {
    // 400k at 6.5% over 30 years monthly.
    assertClose(calculatePeriodicRepayment(400_000, 0.065, 12, 360), 2528.27);
  });

  it("divides evenly when the interest rate is zero", () => {
    // Guards the r === 0 branch, which would otherwise divide by zero.
    assert.equal(calculatePeriodicRepayment(120_000, 0, 12, 120), 1000);
  });

  it("never returns NaN or Infinity for an interest-free loan", () => {
    const repayment = calculatePeriodicRepayment(250_000, 0, 52, 1040);
    assert.ok(Number.isFinite(repayment), "expected a finite repayment");
  });

  it("returns 0 for degenerate input rather than NaN", () => {
    assert.equal(calculatePeriodicRepayment(0, 0.065, 12, 360), 0);
    assert.equal(calculatePeriodicRepayment(400_000, 0.065, 12, 0), 0);
    assert.equal(calculatePeriodicRepayment(-5, 0.065, 12, 360), 0);
    assert.equal(calculatePeriodicRepayment(400_000, 0.065, 0, 360), 0);
    assert.equal(calculatePeriodicRepayment(NaN, 0.065, 12, 360), 0);
  });

  it("repayment rises as the interest rate rises", () => {
    const at5 = calculatePeriodicRepayment(400_000, 0.05, 12, 360);
    const at7 = calculatePeriodicRepayment(400_000, 0.07, 12, 360);
    assert.ok(at7 > at5, "a higher rate must cost more per payment");
  });

  it("repayment falls as the term lengthens", () => {
    // Spreading the same loan over more payments lowers each one.
    const at15 = calculatePeriodicRepayment(400_000, 0.065, 12, 180);
    const at30 = calculatePeriodicRepayment(400_000, 0.065, 12, 360);
    assertClose(at15, 3484.43);
    assert.ok(at30 < at15, "a longer term must lower the periodic payment");
  });
});

describe("totalPaymentsFor", () => {
  it("maps each frequency to its periods per year", () => {
    const cases: Array<[RepaymentFrequency, number]> = [
      ["weekly", 52],
      ["fortnightly", 26],
      ["monthly", 12],
    ];
    for (const [frequency, expected] of cases) {
      assert.equal(totalPaymentsFor(10, frequency), expected * 10);
    }
  });

  it("returns 0 for a non-positive term", () => {
    assert.equal(totalPaymentsFor(0, "monthly"), 0);
    assert.equal(totalPaymentsFor(-5, "monthly"), 0);
  });
});

describe("buildSchedule", () => {
  it("produces one row per payment", () => {
    assert.equal(buildSchedule(BASE).length, 360);
  });

  it("closes the loan at exactly zero", () => {
    const schedule = buildSchedule(BASE);
    assert.equal(schedule.at(-1)?.balance, 0);
  });

  it("repays exactly the principal borrowed across the schedule", () => {
    const schedule = buildSchedule(BASE);
    const principal = schedule.reduce((sum, row) => sum + row.principal, 0);
    assertClose(principal, 400_000, 0.000001);
  });

  it("splits every payment into interest plus principal", () => {
    for (const row of buildSchedule(BASE)) {
      assertClose(row.payment, row.interest + row.principal, 1e-9);
    }
  });

  it("only charges interest on the outstanding balance", () => {
    const schedule = buildSchedule(BASE);
    const r = 0.065 / 12;
    for (const row of schedule) {
      const balanceBefore = row.balance + row.principal;
      assertClose(row.interest, balanceBefore * r, 1e-9);
    }
  });

  it("never lets the balance go negative", () => {
    for (const row of buildSchedule(BASE)) {
      assert.ok(row.balance >= 0, `balance dipped to ${row.balance}`);
    }
  });

  it("keeps the balance flat for an interest-only loan", () => {
    const schedule = buildSchedule({ ...BASE, type: "interest-only" });
    assert.equal(schedule.length, 360);
    for (const row of schedule) {
      assert.equal(row.balance, 400_000);
      assert.equal(row.principal, 0);
    }
  });

  it("charges interest only on an interest-only loan", () => {
    const schedule = buildSchedule({ ...BASE, type: "interest-only" });
    for (const row of schedule) {
      assertClose(row.payment, row.interest, 1e-9);
    }
  });

  it("works at an interest rate of zero", () => {
    const schedule = buildSchedule({ ...BASE, annualInterestRate: 0 });
    assert.equal(schedule.length, 360);
    assert.equal(schedule.at(-1)?.balance, 0);
    for (const row of schedule) {
      assert.equal(row.interest, 0);
    }
  });

  it("works for every repayment frequency", () => {
    const cases: Array<[RepaymentFrequency, number]> = [
      ["weekly", 52 * 30],
      ["fortnightly", 26 * 30],
      ["monthly", 12 * 30],
    ];
    for (const [frequency, expectedRows] of cases) {
      const schedule = buildSchedule({ ...BASE, frequency });
      assert.equal(schedule.length, expectedRows);
      assert.equal(schedule.at(-1)?.balance, 0);
    }
  });

  it("returns an empty schedule for a non-positive term", () => {
    assert.deepEqual(buildSchedule({ ...BASE, termYears: 0 }), []);
    assert.deepEqual(buildSchedule({ ...BASE, termYears: -10 }), []);
  });

  it("handles a very high interest rate without exploding", () => {
    const schedule = buildSchedule({ ...BASE, annualInterestRate: 0.5 });
    assert.equal(schedule.length, 360);
    assert.equal(schedule.at(-1)?.balance, 0);
  });
});

describe("summariseByYear", () => {
  it("groups a 30 year monthly schedule into 30 yearly rows", () => {
    const schedule = buildSchedule(BASE);
    const yearly = summariseByYear(schedule, 12);
    assert.equal(yearly.length, 30);
  });

  it("accounts for every payment exactly once", () => {
    const schedule = buildSchedule(BASE);
    const yearly = summariseByYear(schedule, 12);
    const payments = yearly.reduce((sum, row) => sum + row.payments, 0);
    assert.equal(payments, 360);
  });

  it("yearly interest and principal reconcile with the schedule totals", () => {
    const schedule = buildSchedule(BASE);
    const yearly = summariseByYear(schedule, 12);
    const interest = yearly.reduce((sum, row) => sum + row.interestPaid, 0);
    const principal = yearly.reduce((sum, row) => sum + row.principalPaid, 0);
    const scheduleInterest = schedule.reduce((s, r) => s + r.interest, 0);
    const schedulePrincipal = schedule.reduce((s, r) => s + r.principal, 0);
    assertClose(interest, scheduleInterest, 1e-6);
    assertClose(principal, schedulePrincipal, 1e-6);
  });

  it("reports the closing balance of each year", () => {
    const schedule = buildSchedule(BASE);
    const yearly = summariseByYear(schedule, 12);
    assertClose(yearly[0].balance, schedule[11].balance, 1e-9);
    assert.equal(yearly.at(-1)?.balance, 0);
  });

  it("handles a term that is not a whole number of years", () => {
    // 2.5 years monthly = 30 payments, so the final year is part-year.
    const schedule = buildSchedule({ ...BASE, termYears: 2.5 });
    const yearly = summariseByYear(schedule, 12);
    assert.equal(yearly.length, 3);
    assert.equal(yearly.at(-1)?.payments, 6);
  });

  it("returns no rows for an empty schedule", () => {
    assert.deepEqual(summariseByYear([], 12), []);
  });

  it("returns no rows when periodsPerYear is zero", () => {
    assert.deepEqual(summariseByYear(buildSchedule(BASE), 0), []);
  });
});

describe("calculateMortgage", () => {
  it("returns the headline figures for a known loan", () => {
    const result = calculateMortgage(BASE);
    assertClose(result.periodicRepayment, 2528.27);
    assertClose(result.totalInterest, 510_177.95, 0.5);
    assertClose(result.totalPrincipal, 400_000, 0.000001);
    assert.equal(result.totalPayments, 360);
    assert.equal(result.yearsToRepay, 30);
    assert.equal(result.frequencyLabel, "Monthly");
    assert.equal(result.interestOnly, false);
  });

  it("keeps the books balanced: repaid equals principal plus interest", () => {
    const result = calculateMortgage(BASE);
    assertClose(
      result.totalRepaid,
      result.totalPrincipal + result.totalInterest,
      1e-6,
    );
  });

  it("does not multiply the repayment by the payment count to get the total", () => {
    // The final payment is adjusted to clear the balance exactly, so
    // repayment * n is very slightly off. The result must not be.
    const result = calculateMortgage(BASE);
    assert.notEqual(result.totalRepaid, result.periodicRepayment * 360);
    assertClose(
      result.totalRepaid,
      result.totalPrincipal + result.totalInterest,
      1e-6,
    );
  });

  it("reports no payoff horizon for an interest-only loan", () => {
    const result = calculateMortgage({ ...BASE, type: "interest-only" });
    assert.equal(result.yearsToRepay, null);
    assert.equal(result.interestOnly, true);
    assert.equal(result.totalPrincipal, 0);
    assertClose(result.periodicRepayment, 400_000 * (0.065 / 12));
  });

  it("costs nothing in interest at a zero rate", () => {
    const result = calculateMortgage({ ...BASE, annualInterestRate: 0 });
    assert.equal(result.totalInterest, 0);
    assertClose(result.periodicRepayment, 400_000 / 360);
    assertClose(result.totalRepaid, 400_000, 0.000001);
  });

  it("stays finite and non-NaN for every supported frequency", () => {
    const frequencies: RepaymentFrequency[] = [
      "weekly",
      "fortnightly",
      "monthly",
    ];
    for (const frequency of frequencies) {
      const result = calculateMortgage({ ...BASE, frequency });
      assert.ok(Number.isFinite(result.periodicRepayment));
      assert.ok(Number.isFinite(result.totalInterest));
      assert.ok(Number.isFinite(result.totalRepaid));
      assert.equal(result.yearly.length, 30);
    }
  });

  it("returns zeroes for a zero term instead of throwing", () => {
    const result = calculateMortgage({ ...BASE, termYears: 0 });
    assert.equal(result.periodicRepayment, 0);
    assert.equal(result.totalPayments, 0);
    assert.equal(result.totalInterest, 0);
    assert.deepEqual(result.yearly, []);
  });

  it("charges more total interest over a longer term", () => {
    const at15 = calculateMortgage({ ...BASE, termYears: 15 });
    const at30 = calculateMortgage({ ...BASE, termYears: 30 });
    assert.ok(
      at30.totalInterest > at15.totalInterest,
      "a longer term must cost more in total interest",
    );
  });
});

describe("isValidMortgageInput", () => {
  it("accepts a sane loan", () => {
    assert.equal(isValidMortgageInput(BASE), true);
  });

  it("accepts a zero interest rate", () => {
    assert.equal(
      isValidMortgageInput({ ...BASE, annualInterestRate: 0 }),
      true,
    );
  });

  it("rejects a zero or negative principal", () => {
    assert.equal(isValidMortgageInput({ ...BASE, principal: 0 }), false);
    assert.equal(isValidMortgageInput({ ...BASE, principal: -1 }), false);
  });

  it("rejects a zero or negative term", () => {
    assert.equal(isValidMortgageInput({ ...BASE, termYears: 0 }), false);
    assert.equal(isValidMortgageInput({ ...BASE, termYears: -5 }), false);
  });

  it("rejects a negative interest rate", () => {
    assert.equal(
      isValidMortgageInput({ ...BASE, annualInterestRate: -0.01 }),
      false,
    );
  });

  it("rejects NaN", () => {
    assert.equal(isValidMortgageInput({ ...BASE, principal: NaN }), false);
    assert.equal(isValidMortgageInput({ ...BASE, termYears: NaN }), false);
  });
});

describe("clamp", () => {
  it("leaves in-range values alone", () => {
    assert.equal(clamp(5, 0, 10), 5);
  });

  it("clamps to the bounds", () => {
    assert.equal(clamp(-1, 0, 10), 0);
    assert.equal(clamp(11, 0, 10), 10);
  });
});
