/**
 * Mortgage repayment maths.
 *
 * Framework-free and side-effect free so it can be unit tested directly and
 * called from either a Server or a Client Component.
 *
 * Notation used throughout:
 *   P = principal (loan amount)
 *   r = periodic interest rate (annual rate / payments per year)
 *   n = total number of payments
 *   M = periodic repayment
 *
 * The amortising repayment is the standard annuity formula:
 *   M = (P * r) / (1 - (1 + r)^-n)
 */

export const REPAYMENT_FREQUENCIES = {
  weekly: { label: "Weekly", periodsPerYear: 52 },
  fortnightly: { label: "Fortnightly", periodsPerYear: 26 },
  monthly: { label: "Monthly", periodsPerYear: 12 },
} as const;

export type RepaymentFrequency = keyof typeof REPAYMENT_FREQUENCIES;

export const REPAYMENT_TYPES = {
  "principal-and-interest": "Principal & interest",
  "interest-only": "Interest only",
} as const;

export type RepaymentType = keyof typeof REPAYMENT_TYPES;

export interface MortgageInput {
  /** Loan amount in dollars. */
  principal: number;
  /** Annual interest rate as a decimal, e.g. 0.065 for 6.5%. */
  annualInterestRate: number;
  /** Term in years. */
  termYears: number;
  frequency: RepaymentFrequency;
  type: RepaymentType;
}

export interface ScheduleRow {
  /** 1-based payment number. */
  period: number;
  payment: number;
  interest: number;
  principal: number;
  /** Remaining balance after this payment. */
  balance: number;
}

export interface YearlySummaryRow {
  year: number;
  payments: number;
  principalPaid: number;
  interestPaid: number;
  /** Closing balance at the end of the year. */
  balance: number;
}

export interface MortgageResult {
  periodicRepayment: number;
  totalInterest: number;
  totalPrincipal: number;
  totalRepaid: number;
  totalPayments: number;
  periodsPerYear: number;
  frequencyLabel: string;
  interestOnly: boolean;
  /** null for interest-only, where the balance never reduces. */
  yearsToRepay: number | null;
  yearly: YearlySummaryRow[];
}

/** Guard rails for the input fields, in the units the user types them. */
export const MORTGAGE_LIMITS = {
  principal: { min: 1, max: 100_000_000 },
  /** 0% to 50% p.a. */
  annualInterestRate: { min: 0, max: 0.5 },
  termYears: { min: 1, max: 50 },
} as const;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function isValidMortgageInput(
  input: MortgageInput,
): input is MortgageInput {
  const { principal, annualInterestRate, termYears } = input;
  return (
    Number.isFinite(principal) &&
    principal >= MORTGAGE_LIMITS.principal.min &&
    Number.isFinite(annualInterestRate) &&
    annualInterestRate >= MORTGAGE_LIMITS.annualInterestRate.min &&
    Number.isFinite(termYears) &&
    termYears >= MORTGAGE_LIMITS.termYears.min
  );
}

export function totalPaymentsFor(
  termYears: number,
  frequency: RepaymentFrequency,
): number {
  const { periodsPerYear } = REPAYMENT_FREQUENCIES[frequency];
  if (!Number.isFinite(termYears) || termYears <= 0) return 0;
  return Math.round(termYears * periodsPerYear);
}

/**
 * The level repayment that fully clears `principal` over `totalPayments`.
 *
 * Returns 0 rather than NaN/Infinity for degenerate input so callers can render
 * a result without special-casing. Note the `r === 0` branch: without it the
 * formula divides by zero and yields Infinity for an interest-free loan.
 */
export function calculatePeriodicRepayment(
  principal: number,
  annualInterestRate: number,
  periodsPerYear: number,
  totalPayments: number,
): number {
  if (
    !Number.isFinite(principal) ||
    principal <= 0 ||
    !Number.isFinite(annualInterestRate) ||
    annualInterestRate < 0 ||
    !Number.isFinite(periodsPerYear) ||
    periodsPerYear <= 0 ||
    !Number.isFinite(totalPayments) ||
    totalPayments <= 0
  ) {
    return 0;
  }

  const r = annualInterestRate / periodsPerYear;

  // Interest-free loan: the principal simply divides evenly.
  if (r === 0) return principal / totalPayments;

  const denominator = 1 - Math.pow(1 + r, -totalPayments);
  if (denominator === 0) return 0;

  return (principal * r) / denominator;
}

/**
 * Full payment-by-payment schedule.
 *
 * For the final payment the principal portion is pinned to the exact remaining
 * balance so the loan closes at precisely 0 rather than leaving a few cents of
 * floating point residue. That is also why the last payment can differ from the
 * regular repayment by a couple of cents.
 */
export function buildSchedule(input: MortgageInput): ScheduleRow[] {
  const { periodsPerYear } = REPAYMENT_FREQUENCIES[input.frequency];
  const totalPayments = totalPaymentsFor(input.termYears, input.frequency);

  if (
    !Number.isFinite(input.principal) ||
    input.principal <= 0 ||
    totalPayments <= 0 ||
    !Number.isFinite(input.annualInterestRate) ||
    input.annualInterestRate < 0
  ) {
    return [];
  }

  const r = input.annualInterestRate / periodsPerYear;
  const rows: ScheduleRow[] = [];

  if (input.type === "interest-only") {
    // The balance never reduces, so every payment is pure interest.
    const payment = input.principal * r;
    for (let period = 1; period <= totalPayments; period += 1) {
      rows.push({
        period,
        payment,
        interest: payment,
        principal: 0,
        balance: input.principal,
      });
    }
    return rows;
  }

  const periodicRepayment = calculatePeriodicRepayment(
    input.principal,
    input.annualInterestRate,
    periodsPerYear,
    totalPayments,
  );

  let balance = input.principal;

  for (let period = 1; period <= totalPayments; period += 1) {
    const interest = balance * r;
    const isFinalPayment = period === totalPayments;
    // Never repay more than is owed, and always clear the balance on the last
    // payment so the schedule ends at exactly zero.
    const principalPart = isFinalPayment
      ? balance
      : Math.min(periodicRepayment - interest, balance);

    balance -= principalPart;

    rows.push({
      period,
      payment: principalPart + interest,
      interest,
      principal: principalPart,
      balance,
    });
  }

  return rows;
}

/**
 * Collapses a schedule to one row per year in a single pass, so the full
 * payment schedule never has to be walked more than once for display.
 */
export function summariseByYear(
  schedule: ScheduleRow[],
  periodsPerYear: number,
): YearlySummaryRow[] {
  const rows: YearlySummaryRow[] = [];
  if (periodsPerYear <= 0) return rows;

  let principalPaid = 0;
  let interestPaid = 0;
  let payments = 0;

  for (let i = 0; i < schedule.length; i += 1) {
    const row = schedule[i];
    principalPaid += row.principal;
    interestPaid += row.interest;
    payments += 1;

    const isYearEnd =
      (i + 1) % periodsPerYear === 0 || i === schedule.length - 1;

    if (isYearEnd) {
      rows.push({
        year: rows.length + 1,
        payments,
        principalPaid,
        interestPaid,
        balance: row.balance,
      });
      principalPaid = 0;
      interestPaid = 0;
      payments = 0;
    }
  }

  return rows;
}

export function calculateMortgage(input: MortgageInput): MortgageResult {
  const { periodsPerYear, label } = REPAYMENT_FREQUENCIES[input.frequency];
  const interestOnly = input.type === "interest-only";

  const schedule = buildSchedule(input);

  // Accumulated in the loop rather than derived as `periodicRepayment * n`,
  // which drifts once the final payment is adjusted.
  let totalInterest = 0;
  let totalPrincipal = 0;
  let totalRepaid = 0;

  for (const row of schedule) {
    totalInterest += row.interest;
    totalPrincipal += row.principal;
    totalRepaid += row.payment;
  }

  const periodicRepayment = interestOnly
    ? input.principal * (input.annualInterestRate / periodsPerYear)
    : calculatePeriodicRepayment(
        input.principal,
        input.annualInterestRate,
        periodsPerYear,
        schedule.length,
      );

  return {
    periodicRepayment,
    totalInterest,
    totalPrincipal,
    totalRepaid,
    totalPayments: schedule.length,
    periodsPerYear,
    frequencyLabel: label,
    interestOnly,
    yearsToRepay: interestOnly ? null : schedule.length / periodsPerYear,
    yearly: summariseByYear(schedule, periodsPerYear),
  };
}
