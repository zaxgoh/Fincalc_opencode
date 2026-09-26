/**
 * Compound interest maths.
 *
 * Framework-free and side-effect free so it can be unit tested directly and
 * called from either a Server or a Client Component.
 *
 * Notation used throughout:
 *   P = initial deposit
 *   C = regular contribution made once per contribution period
 *   r = annual rate of return as a decimal
 *   n = compounding periods per year
 *   c = contribution periods per year
 *   N = total number of contribution periods (c * years)
 *
 * The projection is stepped once per *contribution* period rather than once per
 * compounding period, and the per-period growth factor is derived from the
 * compounding frequency:
 *
 *   i = (1 + r/n)^(n/c) - 1
 *
 * That is the rate which, applied over 1/c of a year, is identical to applying
 * r/n over n/c compounding periods. Using r/c instead would quietly give the
 * wrong answer whenever c and n do not divide evenly — weekly contributions
 * against daily compounding, for instance.
 *
 * Contribution timing is the standard annuity distinction: a contribution made
 * at the start of a period earns one extra period of growth, so the start-of-
 * period balance is the end-of-period balance times (1 + i).
 */

export const COMPOUNDING_FREQUENCIES = {
  daily: { label: "Daily", periodsPerYear: 365 },
  weekly: { label: "Weekly", periodsPerYear: 52 },
  monthly: { label: "Monthly", periodsPerYear: 12 },
  quarterly: { label: "Quarterly", periodsPerYear: 4 },
  annually: { label: "Annually", periodsPerYear: 1 },
} as const;

export type CompoundingFrequency = keyof typeof COMPOUNDING_FREQUENCIES;

export const CONTRIBUTION_FREQUENCIES = {
  weekly: { label: "Weekly", periodsPerYear: 52 },
  fortnightly: { label: "Fortnightly", periodsPerYear: 26 },
  monthly: { label: "Monthly", periodsPerYear: 12 },
  quarterly: { label: "Quarterly", periodsPerYear: 4 },
  annually: { label: "Annually", periodsPerYear: 1 },
} as const;

export type ContributionFrequency = keyof typeof CONTRIBUTION_FREQUENCIES;

export const CONTRIBUTION_TIMINGS = {
  "end-of-period": "End of period",
  "start-of-period": "Start of period",
} as const;

export type ContributionTiming = keyof typeof CONTRIBUTION_TIMINGS;

export interface CompoundInterestInput {
  /** Starting balance in dollars. */
  initialDeposit: number;
  /** Regular contribution in dollars, made once per contribution period. */
  contribution: number;
  /** Annual rate of return as a decimal, e.g. 0.07 for 7%. */
  annualReturnRate: number;
  /** Annual inflation rate as a decimal, only used when `inflationAdjusted`. */
  annualInflationRate: number;
  /** When true, results are expressed in today's dollars. */
  inflationAdjusted: boolean;
  /** Time horizon in years. */
  years: number;
  contributionFrequency: ContributionFrequency;
  contributionTiming: ContributionTiming;
  compoundingFrequency: CompoundingFrequency;
}

/** One row per elapsed year (or per part-year on a fractional horizon). */
export interface GrowthRow {
  /** 1-based year number. */
  year: number;
  /** Contributions made during the year, including deposits. */
  contributions: number;
  /** Growth credited during the year. */
  interestEarned: number;
  /** Closing balance at the end of the year. */
  balance: number;
}

/** The same projection repeated at each compounding frequency. */
export interface CompoundingComparisonRow {
  frequency: CompoundingFrequency;
  label: string;
  finalBalance: number;
  interestEarned: number;
}

export interface CompoundInterestResult {
  initialDeposit: number;
  contribution: number;
  /** Rate the projection actually ran at, after any inflation adjustment. */
  effectiveAnnualRate: number;
  /** Headline rate, before any inflation adjustment. */
  nominalAnnualRate: number;
  inflationAdjusted: boolean;
  finalBalance: number;
  /** The same projection at the headline rate, for comparison when adjusting. */
  nominalFinalBalance: number;
  totalContributed: number;
  totalInterest: number;
  /** Where the starting deposit alone would have ended up on its own. */
  balanceWithoutContributions: number;
  totalPeriods: number;
  years: number;
  yearly: GrowthRow[];
  comparison: CompoundingComparisonRow[];
}

/** Guard rails for the input fields, in the units the user types them. */
export const COMPOUND_INTEREST_LIMITS = {
  initialDeposit: { min: 0, max: 100_000_000 },
  contribution: { min: 0, max: 10_000_000 },
  /** 0% to 50% p.a. */
  annualReturnRate: { min: 0, max: 0.5 },
  /** 0% to 50% p.a. */
  annualInflationRate: { min: 0, max: 0.5 },
  years: { min: 1, max: 50 },
} as const;

export function isValidCompoundInterestInput(
  input: CompoundInterestInput,
): input is CompoundInterestInput {
  const {
    initialDeposit,
    contribution,
    annualReturnRate,
    annualInflationRate,
    years,
  } = input;

  return (
    Number.isFinite(initialDeposit) &&
    initialDeposit >= COMPOUND_INTEREST_LIMITS.initialDeposit.min &&
    initialDeposit <= COMPOUND_INTEREST_LIMITS.initialDeposit.max &&
    Number.isFinite(contribution) &&
    contribution >= COMPOUND_INTEREST_LIMITS.contribution.min &&
    contribution <= COMPOUND_INTEREST_LIMITS.contribution.max &&
    Number.isFinite(annualReturnRate) &&
    annualReturnRate >= COMPOUND_INTEREST_LIMITS.annualReturnRate.min &&
    annualReturnRate <= COMPOUND_INTEREST_LIMITS.annualReturnRate.max &&
    Number.isFinite(annualInflationRate) &&
    annualInflationRate >= COMPOUND_INTEREST_LIMITS.annualInflationRate.min &&
    annualInflationRate <= COMPOUND_INTEREST_LIMITS.annualInflationRate.max &&
    Number.isFinite(years) &&
    years >= COMPOUND_INTEREST_LIMITS.years.min &&
    years <= COMPOUND_INTEREST_LIMITS.years.max
  );
}

/**
 * The growth factor for one contribution period.
 *
 * Note the `r === 0` case falls out naturally: (1 + 0)^anything - 1 is 0, so an
 * interest-free projection never divides by zero.
 *
 * Negative rates are legitimate here. Adjusting for inflation can leave a
 * negative *real* rate — 3% inflation against a 0% return shrinks the balance —
 * and that has to compound as a loss rather than being floored at zero.
 */
export function periodRate(
  annualRate: number,
  compoundingPeriodsPerYear: number,
  contributionPeriodsPerYear: number,
): number {
  if (
    !Number.isFinite(annualRate) ||
    !Number.isFinite(compoundingPeriodsPerYear) ||
    compoundingPeriodsPerYear <= 0 ||
    !Number.isFinite(contributionPeriodsPerYear) ||
    contributionPeriodsPerYear <= 0
  ) {
    return 0;
  }

  const perCompoundingPeriod = 1 + annualRate / compoundingPeriodsPerYear;

  // Unreachable for any rate the limits allow, but a negative base raised to a
  // fractional power is NaN, so total loss is the safe answer.
  if (perCompoundingPeriod <= 0) return -1;

  return (
    Math.pow(
      perCompoundingPeriod,
      compoundingPeriodsPerYear / contributionPeriodsPerYear,
    ) - 1
  );
}

/** The rate of return after inflation, as a decimal. */
export function realAnnualRate(
  nominalRate: number,
  inflationRate: number,
): number {
  if (
    !Number.isFinite(nominalRate) ||
    !Number.isFinite(inflationRate) ||
    inflationRate <= -1
  ) {
    return 0;
  }
  return (1 + nominalRate) / (1 + inflationRate) - 1;
}

export function totalPeriodsFor(
  years: number,
  frequency: ContributionFrequency,
): number {
  const { periodsPerYear } = CONTRIBUTION_FREQUENCIES[frequency];
  if (!Number.isFinite(years) || years <= 0) return 0;
  return Math.round(years * periodsPerYear);
}

interface Projection {
  finalBalance: number;
  totalContributed: number;
  totalInterest: number;
  totalPeriods: number;
  yearly: GrowthRow[];
}

/**
 * Steps the balance forward one contribution period at a time.
 *
 * Yearly rows are emitted as the schedule is built, so the per-period detail
 * never has to be retained or walked a second time for display.
 */
function runProjection(
  initialDeposit: number,
  contribution: number,
  annualRate: number,
  years: number,
  contributionFrequency: ContributionFrequency,
  contributionTiming: ContributionTiming,
  compoundingFrequency: CompoundingFrequency,
): Projection {
  const empty: Projection = {
    finalBalance: 0,
    totalContributed: 0,
    totalInterest: 0,
    totalPeriods: 0,
    yearly: [],
  };

  const { periodsPerYear: c } = CONTRIBUTION_FREQUENCIES[contributionFrequency];
  const { periodsPerYear: n } = COMPOUNDING_FREQUENCIES[compoundingFrequency];
  const totalPeriods = totalPeriodsFor(years, contributionFrequency);

  if (
    !Number.isFinite(initialDeposit) ||
    initialDeposit < 0 ||
    !Number.isFinite(contribution) ||
    contribution < 0 ||
    !Number.isFinite(annualRate) ||
    // A real rate below -100% is not reachable, but it is the point past which
    // the projection stops being meaningful.
    annualRate <= -1 ||
    totalPeriods <= 0
  ) {
    return empty;
  }

  const i = periodRate(annualRate, n, c);
  const atStart = contributionTiming === "start-of-period";

  let balance = initialDeposit;
  let totalContributed = initialDeposit;
  let totalInterest = 0;
  // The opening deposit lands in year one, so the yearly contributions column
  // sums back to `totalContributed` rather than quietly dropping it.
  let yearContributed = initialDeposit;
  let yearInterest = 0;
  const yearly: GrowthRow[] = [];

  for (let period = 1; period <= totalPeriods; period += 1) {
    if (atStart) {
      balance += contribution;
      totalContributed += contribution;
      yearContributed += contribution;
    }

    const interest = balance * i;
    balance += interest;
    totalInterest += interest;
    yearInterest += interest;

    if (!atStart) {
      balance += contribution;
      totalContributed += contribution;
      yearContributed += contribution;
    }

    // A fractional horizon leaves a part-year final row, which is flushed by
    // the `period === totalPeriods` arm.
    const isYearEnd = period % c === 0 || period === totalPeriods;
    if (isYearEnd) {
      yearly.push({
        year: yearly.length + 1,
        contributions: yearContributed,
        interestEarned: yearInterest,
        balance,
      });
      yearContributed = 0;
      yearInterest = 0;
    }
  }

  return {
    finalBalance: balance,
    totalContributed,
    totalInterest,
    totalPeriods,
    yearly,
  };
}

/**
 * Year-by-year growth for the given input, at the input's headline rate.
 *
 * Exposed separately so callers can project a single scenario without also
 * paying for the compounding-frequency comparison.
 */
export function buildGrowthSchedule(input: CompoundInterestInput): GrowthRow[] {
  return runProjection(
    input.initialDeposit,
    input.contribution,
    input.annualReturnRate,
    input.years,
    input.contributionFrequency,
    input.contributionTiming,
    input.compoundingFrequency,
  ).yearly;
}

/**
 * Runs the input at every supported compounding frequency.
 *
 * Respects `inflationAdjusted` itself, so the comparison is always in the same
 * terms as the headline figures.
 */
export function compareCompoundingFrequencies(
  input: CompoundInterestInput,
): CompoundingComparisonRow[] {
  const annualRate = input.inflationAdjusted
    ? realAnnualRate(input.annualReturnRate, input.annualInflationRate)
    : input.annualReturnRate;

  return (Object.keys(COMPOUNDING_FREQUENCIES) as CompoundingFrequency[]).map(
    (frequency) => {
      const projection = runProjection(
        input.initialDeposit,
        input.contribution,
        annualRate,
        input.years,
        input.contributionFrequency,
        input.contributionTiming,
        frequency,
      );
      return {
        frequency,
        label: COMPOUNDING_FREQUENCIES[frequency].label,
        finalBalance: projection.finalBalance,
        interestEarned: projection.totalInterest,
      };
    },
  );
}

export function calculateCompoundInterest(
  input: CompoundInterestInput,
): CompoundInterestResult {
  const effectiveAnnualRate = input.inflationAdjusted
    ? realAnnualRate(input.annualReturnRate, input.annualInflationRate)
    : input.annualReturnRate;

  const project = (annualRate: number, contribution: number) =>
    runProjection(
      input.initialDeposit,
      contribution,
      annualRate,
      input.years,
      input.contributionFrequency,
      input.contributionTiming,
      input.compoundingFrequency,
    );

  const projection = project(effectiveAnnualRate, input.contribution);
  const withoutContributions = project(effectiveAnnualRate, 0);
  const nominal = input.inflationAdjusted
    ? project(input.annualReturnRate, input.contribution)
    : projection;

  return {
    initialDeposit: input.initialDeposit,
    contribution: input.contribution,
    effectiveAnnualRate,
    nominalAnnualRate: input.annualReturnRate,
    inflationAdjusted: input.inflationAdjusted,
    finalBalance: projection.finalBalance,
    nominalFinalBalance: nominal.finalBalance,
    totalContributed: projection.totalContributed,
    totalInterest: projection.totalInterest,
    balanceWithoutContributions: withoutContributions.finalBalance,
    totalPeriods: projection.totalPeriods,
    years: input.years,
    yearly: projection.yearly,
    comparison: compareCompoundingFrequencies(input),
  };
}
