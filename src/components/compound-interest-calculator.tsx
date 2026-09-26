"use client";

import { useId, useMemo, useState } from "react";
import { Info } from "lucide-react";

import {
  COMPOUNDING_FREQUENCIES,
  COMPOUND_INTEREST_LIMITS,
  CONTRIBUTION_FREQUENCIES,
  CONTRIBUTION_TIMINGS,
  calculateCompoundInterest,
  isValidCompoundInterestInput,
  realAnnualRate,
  type CompoundInterestInput,
  type CompoundingFrequency,
  type ContributionFrequency,
  type ContributionTiming,
} from "@/lib/calculations/compound-interest";
import { formatCurrency, formatPercent, formatShare } from "@/lib/format";
import { parseNumeric } from "@/lib/parse";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

/** Hoisted so the Selects get a stable `items` reference across renders. */
const CONTRIBUTION_FREQUENCY_ITEMS = (
  Object.keys(CONTRIBUTION_FREQUENCIES) as ContributionFrequency[]
).map((value) => ({
  value,
  label: CONTRIBUTION_FREQUENCIES[value].label,
}));

const COMPOUNDING_FREQUENCY_ITEMS = (
  Object.keys(COMPOUNDING_FREQUENCIES) as CompoundingFrequency[]
).map((value) => ({ value, label: COMPOUNDING_FREQUENCIES[value].label }));

const TIMING_ITEMS = (
  Object.keys(CONTRIBUTION_TIMINGS) as ContributionTiming[]
).map((value) => ({ value, label: CONTRIBUTION_TIMINGS[value] }));

function isContributionFrequency(
  value: string,
): value is ContributionFrequency {
  return value in CONTRIBUTION_FREQUENCIES;
}

function isCompoundingFrequency(value: string): value is CompoundingFrequency {
  return value in COMPOUNDING_FREQUENCIES;
}

function isContributionTiming(value: string): value is ContributionTiming {
  return value in CONTRIBUTION_TIMINGS;
}

/** e.g. 4.23 -> "4.2x". A zero starting deposit has no meaningful multiple. */
function formatMultiple(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(1)}x`;
}

export function CompoundInterestCalculator() {
  const id = useId();

  // Held as strings so the user can freely clear and retype a field without
  // the input fighting them. Parsed only for calculation.
  const [depositInput, setDepositInput] = useState("10000");
  const [contributionInput, setContributionInput] = useState("500");
  const [rateInput, setRateInput] = useState("7");
  const [inflationInput, setInflationInput] = useState("2.5");
  const [yearsInput, setYearsInput] = useState("30");
  const [contributionFrequency, setContributionFrequency] =
    useState<ContributionFrequency>("monthly");
  const [contributionTiming, setContributionTiming] =
    useState<ContributionTiming>("end-of-period");
  const [compoundingFrequency, setCompoundingFrequency] =
    useState<CompoundingFrequency>("monthly");
  const [inflationAdjusted, setInflationAdjusted] = useState(false);

  const initialDeposit = parseNumeric(depositInput);
  const contribution = parseNumeric(contributionInput);
  // The user types a percentage; the maths works in decimals.
  const annualReturnRate = parseNumeric(rateInput) / 100;
  const annualInflationRate = parseNumeric(inflationInput) / 100;
  const years = parseNumeric(yearsInput);

  // Simple boolean derivations, deliberately not memoised.
  const depositValid =
    Number.isFinite(initialDeposit) &&
    initialDeposit >= COMPOUND_INTEREST_LIMITS.initialDeposit.min &&
    initialDeposit <= COMPOUND_INTEREST_LIMITS.initialDeposit.max;
  const contributionValid =
    Number.isFinite(contribution) &&
    contribution >= COMPOUND_INTEREST_LIMITS.contribution.min &&
    contribution <= COMPOUND_INTEREST_LIMITS.contribution.max;
  const rateValid =
    Number.isFinite(annualReturnRate) &&
    annualReturnRate >= COMPOUND_INTEREST_LIMITS.annualReturnRate.min &&
    annualReturnRate <= COMPOUND_INTEREST_LIMITS.annualReturnRate.max;
  const inflationValid =
    Number.isFinite(annualInflationRate) &&
    annualInflationRate >= COMPOUND_INTEREST_LIMITS.annualInflationRate.min &&
    annualInflationRate <= COMPOUND_INTEREST_LIMITS.annualInflationRate.max;
  const yearsValid =
    Number.isFinite(years) &&
    years >= COMPOUND_INTEREST_LIMITS.years.min &&
    years <= COMPOUND_INTEREST_LIMITS.years.max;

  // The inflation field is hidden unless the toggle is on, so a blank rate must
  // not invalidate a projection that does not use it.
  const allValid =
    depositValid &&
    contributionValid &&
    rateValid &&
    yearsValid &&
    (!inflationAdjusted || inflationValid);

  const result = useMemo(() => {
    const candidate: CompoundInterestInput = {
      initialDeposit,
      contribution,
      annualReturnRate,
      annualInflationRate,
      inflationAdjusted,
      years,
      contributionFrequency,
      contributionTiming,
      compoundingFrequency,
    };
    if (!isValidCompoundInterestInput(candidate)) return null;
    return calculateCompoundInterest(candidate);
  }, [
    initialDeposit,
    contribution,
    annualReturnRate,
    annualInflationRate,
    inflationAdjusted,
    years,
    contributionFrequency,
    contributionTiming,
    compoundingFrequency,
  ]);

  const compoundingLabel =
    COMPOUNDING_FREQUENCIES[compoundingFrequency].label.toLowerCase();
  const contributionLabel =
    CONTRIBUTION_FREQUENCIES[contributionFrequency].label.toLowerCase();

  // What more frequent compounding would add over annual, from the comparison.
  // Negative when the effective rate is negative, where crediting earnings more
  // often costs money rather than adding it.
  const annualRow = result?.comparison.find(
    (row) => row.frequency === "annually",
  );
  const dailyRow = result?.comparison.find((row) => row.frequency === "daily");
  const compoundingSpread =
    annualRow && dailyRow ? dailyRow.finalBalance - annualRow.finalBalance : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Your money</CardTitle>
          <CardDescription>
            Adjust any field and the projection updates immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <FieldSet>
              <FieldLegend>Deposits</FieldLegend>

              <Field data-invalid={!depositValid || undefined}>
                <FieldLabel htmlFor={`${id}-deposit`}>
                  Starting deposit
                </FieldLabel>
                <InputGroup>
                  <InputGroupAddon>
                    <InputGroupText>$</InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    id={`${id}-deposit`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={depositInput}
                    onChange={(event) => setDepositInput(event.target.value)}
                    aria-invalid={!depositValid || undefined}
                  />
                </InputGroup>
                {depositValid ? (
                  <FieldDescription>
                    What you are investing to begin with.
                  </FieldDescription>
                ) : (
                  <FieldError>
                    Enter an amount between{" "}
                    {formatCurrency(
                      COMPOUND_INTEREST_LIMITS.initialDeposit.min,
                    )}{" "}
                    and{" "}
                    {formatCurrency(
                      COMPOUND_INTEREST_LIMITS.initialDeposit.max,
                    )}
                    .
                  </FieldError>
                )}
              </Field>

              <Field data-invalid={!contributionValid || undefined}>
                <FieldLabel htmlFor={`${id}-contribution`}>
                  Regular contribution
                </FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={`${id}-contribution`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={contributionInput}
                    onChange={(event) =>
                      setContributionInput(event.target.value)
                    }
                    aria-invalid={!contributionValid || undefined}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>per period</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                {contributionValid ? (
                  <FieldDescription>
                    Added on a regular cycle, not as a lump sum.
                  </FieldDescription>
                ) : (
                  <FieldError>
                    Enter an amount between{" "}
                    {formatCurrency(COMPOUND_INTEREST_LIMITS.contribution.min)}{" "}
                    and{" "}
                    {formatCurrency(COMPOUND_INTEREST_LIMITS.contribution.max)}.
                  </FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor={`${id}-contribution-frequency`}>
                  Contribution frequency
                </FieldLabel>
                <Select
                  items={CONTRIBUTION_FREQUENCY_ITEMS}
                  value={contributionFrequency}
                  onValueChange={(value) => {
                    if (value && isContributionFrequency(value)) {
                      setContributionFrequency(value);
                    }
                  }}
                >
                  <SelectTrigger
                    id={`${id}-contribution-frequency`}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {CONTRIBUTION_FREQUENCY_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLegend variant="label">Contribution timing</FieldLegend>
                <ToggleGroup
                  value={[contributionTiming]}
                  onValueChange={(value) => {
                    const next = value[0];
                    if (next && isContributionTiming(next)) {
                      setContributionTiming(next);
                    }
                  }}
                >
                  {TIMING_ITEMS.map((item) => (
                    <ToggleGroupItem key={item.value} value={item.value}>
                      {item.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>
                  Contributing at the start of each period earns one extra
                  period of growth.
                </FieldDescription>
              </Field>
            </FieldSet>

            <FieldSet>
              <FieldLegend>Growth</FieldLegend>

              <Field data-invalid={!rateValid || undefined}>
                <FieldLabel htmlFor={`${id}-rate`}>Expected return</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={`${id}-rate`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={rateInput}
                    onChange={(event) => setRateInput(event.target.value)}
                    aria-invalid={!rateValid || undefined}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>% p.a.</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                {rateValid ? (
                  <FieldDescription>
                    A steady average of {formatPercent(annualReturnRate)} a
                    year, credited {compoundingLabel}.
                  </FieldDescription>
                ) : (
                  <FieldError>
                    Enter a return between 0% and 50% per year.
                  </FieldError>
                )}
              </Field>

              <Field>
                <FieldLabel htmlFor={`${id}-compounding-frequency`}>
                  Compounding frequency
                </FieldLabel>
                <Select
                  items={COMPOUNDING_FREQUENCY_ITEMS}
                  value={compoundingFrequency}
                  onValueChange={(value) => {
                    if (value && isCompoundingFrequency(value)) {
                      setCompoundingFrequency(value);
                    }
                  }}
                >
                  <SelectTrigger
                    id={`${id}-compounding-frequency`}
                    className="w-full"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {COMPOUNDING_FREQUENCY_ITEMS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  How often earnings are added back into the balance.
                </FieldDescription>
              </Field>

              <Field data-invalid={!yearsValid || undefined}>
                <FieldLabel htmlFor={`${id}-years`}>Time horizon</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id={`${id}-years`}
                    inputMode="decimal"
                    autoComplete="off"
                    value={yearsInput}
                    onChange={(event) => setYearsInput(event.target.value)}
                    aria-invalid={!yearsValid || undefined}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupText>years</InputGroupText>
                  </InputGroupAddon>
                </InputGroup>
                {yearsValid ? (
                  <FieldDescription>
                    How long the money stays invested.
                  </FieldDescription>
                ) : (
                  <FieldError>
                    Enter a horizon between {COMPOUND_INTEREST_LIMITS.years.min}{" "}
                    and {COMPOUND_INTEREST_LIMITS.years.max} years.
                  </FieldError>
                )}
              </Field>

              <Field orientation="horizontal">
                <FieldLabel htmlFor={`${id}-inflation-adjusted`}>
                  Adjust for inflation
                </FieldLabel>
                <Switch
                  id={`${id}-inflation-adjusted`}
                  checked={inflationAdjusted}
                  onCheckedChange={setInflationAdjusted}
                />
              </Field>

              {inflationAdjusted ? (
                <Field data-invalid={!inflationValid || undefined}>
                  <FieldLabel htmlFor={`${id}-inflation`}>
                    Inflation rate
                  </FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={`${id}-inflation`}
                      inputMode="decimal"
                      autoComplete="off"
                      value={inflationInput}
                      onChange={(event) =>
                        setInflationInput(event.target.value)
                      }
                      aria-invalid={!inflationValid || undefined}
                    />
                    <InputGroupAddon align="inline-end">
                      <InputGroupText>% p.a.</InputGroupText>
                    </InputGroupAddon>
                  </InputGroup>
                  {inflationValid ? (
                    <FieldDescription>
                      Results become today&apos;s dollars, earning{" "}
                      {formatPercent(
                        realAnnualRate(annualReturnRate, annualInflationRate),
                      )}{" "}
                      a year after inflation.
                    </FieldDescription>
                  ) : (
                    <FieldError>
                      Enter an inflation rate between 0% and 50% per year.
                    </FieldError>
                  )}
                </Field>
              ) : null}
            </FieldSet>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6 lg:col-span-2">
        {result ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>
                  {result.inflationAdjusted
                    ? "Projected balance in today’s dollars"
                    : `Projected balance after ${result.years} years`}
                </CardTitle>
                <CardDescription>
                  {result.inflationAdjusted
                    ? `A real return of ${formatPercent(result.effectiveAnnualRate)} a year, on ${contributionLabel} contributions of ${formatCurrency(result.contribution)}.`
                    : `${formatPercent(result.nominalAnnualRate)} a year compounded ${compoundingLabel}, plus ${contributionLabel} contributions of ${formatCurrency(result.contribution)}.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatCurrency(result.finalBalance)}
                </p>

                <dl className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <dt className="text-sm text-muted-foreground">
                      Total contributed
                    </dt>
                    <dd className="text-lg font-medium tabular-nums">
                      {formatCurrency(result.totalContributed)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-sm text-muted-foreground">
                      Total interest earned
                    </dt>
                    <dd className="text-lg font-medium tabular-nums">
                      {formatCurrency(result.totalInterest)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-sm text-muted-foreground">
                      Projected amount from deposit only, no contributions
                    </dt>
                    <dd className="text-lg font-medium tabular-nums">
                      {formatCurrency(result.balanceWithoutContributions)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-sm text-muted-foreground">
                      {result.inflationAdjusted
                        ? "Same money in future dollars"
                        : "Growth on the starting deposit"}
                    </dt>
                    <dd className="text-lg font-medium tabular-nums">
                      {result.inflationAdjusted
                        ? formatCurrency(result.nominalFinalBalance)
                        : formatMultiple(
                            result.initialDeposit > 0
                              ? result.finalBalance / result.initialDeposit
                              : Number.NaN,
                          )}
                    </dd>
                  </div>
                </dl>

                {result.finalBalance > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {result.totalInterest >= 0
                      ? `Interest accounts for ${formatShare(result.totalInterest / result.finalBalance)} of the balance.`
                      : "Inflation is eroding this balance faster than the return is growing it, so it is worth less than you put in."}
                    {result.contribution > 0
                      ? ` You added ${formatCurrency(result.totalContributed - result.initialDeposit)} yourself across ${result.totalPeriods} contributions, on top of the ${formatCurrency(result.initialDeposit)} starting deposit.`
                      : " Nothing is being added along the way, so this is purely growth on the starting deposit."}
                  </p>
                ) : null}
              </CardContent>
            </Card>

            {result.contribution > 0 && Math.abs(compoundingSpread) >= 1 ? (
              <Alert>
                <Info className="size-4" />
                <AlertTitle>Compounding more often barely matters</AlertTitle>
                <AlertDescription>
                  Crediting earnings daily rather than annually{" "}
                  {compoundingSpread >= 0
                    ? `adds just ${formatCurrency(compoundingSpread)}`
                    : `costs you ${formatCurrency(Math.abs(compoundingSpread))}`}{" "}
                  over {result.years} years on these figures. The contributions
                  and the time in the market do far more work than the number of
                  times interest is credited.
                </AlertDescription>
              </Alert>
            ) : null}

            {result.contribution === 0 && result.initialDeposit > 0 ? (
              <Alert>
                <Info className="size-4" />
                <AlertTitle>No regular contributions</AlertTitle>
                <AlertDescription>
                  Nothing is being added along the way, so this projection is
                  the starting deposit of{" "}
                  {formatCurrency(result.initialDeposit)} growing on its own.
                  Add a regular contribution to see what a savings habit does.
                </AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Year-by-year growth</CardTitle>
                <CardDescription>
                  Growth and contributions across the {result.years} year
                  horizon.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Year</TableHead>
                      <TableHead className="text-right">Contributed</TableHead>
                      <TableHead className="text-right">Interest</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.yearly.map((row) => (
                      <TableRow key={row.year}>
                        <TableCell>{row.year}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.contributions)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.interestEarned)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.balance)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Compounding frequency</CardTitle>
                <CardDescription>
                  The same money, credited at a different frequency.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Frequency</TableHead>
                      <TableHead className="text-right">
                        Final balance
                      </TableHead>
                      <TableHead className="text-right">
                        Interest earned
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.comparison.map((row) => {
                      const selected = row.frequency === compoundingFrequency;
                      return (
                        <TableRow
                          key={row.frequency}
                          className={selected ? "bg-muted/50" : undefined}
                        >
                          <TableCell className="font-medium">
                            <span className="flex items-center gap-2">
                              {row.label}
                              {selected ? (
                                <Badge variant="secondary">Selected</Badge>
                              ) : null}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(row.finalBalance)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(row.interestEarned)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : (
          <Alert variant="destructive">
            <Info className="size-4" />
            <AlertTitle>Check your details</AlertTitle>
            <AlertDescription>
              {allValid
                ? "We could not work out a projection from those details."
                : "Enter a valid deposit, contribution, return and time horizon to see your projection."}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
