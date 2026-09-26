"use client";

import { useId, useMemo, useState } from "react";
import { Info } from "lucide-react";

import {
  MORTGAGE_LIMITS,
  REPAYMENT_FREQUENCIES,
  REPAYMENT_TYPES,
  calculateMortgage,
  isValidMortgageInput,
  type MortgageInput,
  type RepaymentFrequency,
  type RepaymentType,
} from "@/lib/calculations/mortgage";
import { formatCurrency, formatPercent } from "@/lib/format";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Hoisted so the Select gets a stable `items` reference across renders. */
const FREQUENCY_ITEMS = (
  Object.keys(REPAYMENT_FREQUENCIES) as RepaymentFrequency[]
).map((value) => ({ value, label: REPAYMENT_FREQUENCIES[value].label }));

const REPAYMENT_TYPE_ITEMS = (
  Object.keys(REPAYMENT_TYPES) as RepaymentType[]
).map((value) => ({ value, label: REPAYMENT_TYPES[value] }));

const PERIOD_LABELS: Record<RepaymentFrequency, string> = {
  weekly: "week",
  fortnightly: "fortnight",
  monthly: "month",
};

function isRepaymentFrequency(value: string): value is RepaymentFrequency {
  return value in REPAYMENT_FREQUENCIES;
}

function isRepaymentType(value: string): value is RepaymentType {
  return value in REPAYMENT_TYPES;
}

/**
 * Tolerant numeric parsing: strips currency symbols, separators and stray
 * spaces so a pasted "$400,000" still works, while returning NaN for input
 * that is not a number at all so the field can be flagged invalid.
 */
function parseNumeric(raw: string): number {
  const parsed = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function MortgageRepaymentCalculator() {
  const id = useId();

  // Held as strings so the user can freely clear and retype a field without
  // the input fighting them. Parsed only for calculation.
  const [principalInput, setPrincipalInput] = useState("400000");
  const [rateInput, setRateInput] = useState("6.5");
  const [termInput, setTermInput] = useState("30");
  const [frequency, setFrequency] = useState<RepaymentFrequency>("monthly");
  const [repaymentType, setRepaymentType] = useState<RepaymentType>(
    "principal-and-interest",
  );

  const principal = parseNumeric(principalInput);
  // The user types a percentage; the maths works in decimals.
  const annualRate = parseNumeric(rateInput) / 100;
  const termYears = parseNumeric(termInput);

  // Simple boolean derivations, deliberately not memoised.
  const principalValid =
    Number.isFinite(principal) &&
    principal >= MORTGAGE_LIMITS.principal.min &&
    principal <= MORTGAGE_LIMITS.principal.max;
  const rateValid =
    Number.isFinite(annualRate) &&
    annualRate >= MORTGAGE_LIMITS.annualInterestRate.min &&
    annualRate <= MORTGAGE_LIMITS.annualInterestRate.max;
  const termValid =
    Number.isFinite(termYears) &&
    termYears >= MORTGAGE_LIMITS.termYears.min &&
    termYears <= MORTGAGE_LIMITS.termYears.max;

  const allValid = principalValid && rateValid && termValid;

  const result = useMemo(() => {
    const candidate: MortgageInput = {
      principal,
      annualInterestRate: annualRate,
      termYears,
      frequency,
      type: repaymentType,
    };
    if (!isValidMortgageInput(candidate)) return null;
    return calculateMortgage(candidate);
  }, [principal, annualRate, termYears, frequency, repaymentType]);

  const periodLabel = PERIOD_LABELS[frequency];

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle>Loan details</CardTitle>
          <CardDescription>
            Adjust any field and the repayment updates immediately.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field data-invalid={!principalValid || undefined}>
              <FieldLabel htmlFor={`${id}-principal`}>Loan amount</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>$</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id={`${id}-principal`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={principalInput}
                  onChange={(event) => setPrincipalInput(event.target.value)}
                  aria-invalid={!principalValid || undefined}
                />
              </InputGroup>
              {principalValid ? (
                <FieldDescription>
                  The amount you are borrowing.
                </FieldDescription>
              ) : (
                <FieldError>
                  Enter an amount between{" "}
                  {formatCurrency(MORTGAGE_LIMITS.principal.min)} and{" "}
                  {formatCurrency(MORTGAGE_LIMITS.principal.max)}.
                </FieldError>
              )}
            </Field>

            <Field data-invalid={!rateValid || undefined}>
              <FieldLabel htmlFor={`${id}-rate`}>Interest rate</FieldLabel>
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
                  {formatPercent(annualRate)} per year, before compounding.
                </FieldDescription>
              ) : (
                <FieldError>
                  Enter a rate between 0% and 50% per year.
                </FieldError>
              )}
            </Field>

            <Field data-invalid={!termValid || undefined}>
              <FieldLabel htmlFor={`${id}-term`}>Loan term</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id={`${id}-term`}
                  inputMode="decimal"
                  autoComplete="off"
                  value={termInput}
                  onChange={(event) => setTermInput(event.target.value)}
                  aria-invalid={!termValid || undefined}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>years</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
              {termValid ? (
                <FieldDescription>
                  How long you have to repay the loan.
                </FieldDescription>
              ) : (
                <FieldError>
                  Enter a term between {MORTGAGE_LIMITS.termYears.min} and{" "}
                  {MORTGAGE_LIMITS.termYears.max} years.
                </FieldError>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor={`${id}-frequency`}>
                Repayment frequency
              </FieldLabel>
              <Select
                items={FREQUENCY_ITEMS}
                value={frequency}
                onValueChange={(value) => {
                  if (value && isRepaymentFrequency(value)) setFrequency(value);
                }}
              >
                <SelectTrigger id={`${id}-frequency`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {FREQUENCY_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field>
              <FieldLabel htmlFor={`${id}-type`}>Repayment type</FieldLabel>
              <Select
                items={REPAYMENT_TYPE_ITEMS}
                value={repaymentType}
                onValueChange={(value) => {
                  if (value && isRepaymentType(value)) setRepaymentType(value);
                }}
              >
                <SelectTrigger id={`${id}-type`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {REPAYMENT_TYPE_ITEMS.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                Interest-only keeps the balance flat, so you would still owe the
                full amount at the end of the term.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-6 lg:col-span-2">
        {result ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{result.frequencyLabel} repayment</CardTitle>
                <CardDescription>
                  {repaymentType === "interest-only"
                    ? `Covers interest only. The balance stays at ${formatCurrency(principal)}.`
                    : `Repaid in full over ${result.totalPayments} ${periodLabel}ly payments.`}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatCurrency(result.periodicRepayment)}
                </p>

                <dl className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <dt className="text-sm text-muted-foreground">
                      Total interest
                    </dt>
                    <dd className="text-lg font-medium tabular-nums">
                      {formatCurrency(result.totalInterest)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-sm text-muted-foreground">
                      Total repaid
                    </dt>
                    <dd className="text-lg font-medium tabular-nums">
                      {formatCurrency(result.totalRepaid)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-sm text-muted-foreground">
                      Amount borrowed
                    </dt>
                    <dd className="text-lg font-medium tabular-nums">
                      {formatCurrency(result.totalPrincipal)}
                    </dd>
                  </div>
                  <div className="flex flex-col gap-1">
                    <dt className="text-sm text-muted-foreground">
                      Time to repay
                    </dt>
                    <dd className="text-lg font-medium tabular-nums">
                      {result.yearsToRepay === null
                        ? "Not repaid"
                        : `${result.yearsToRepay} years`}
                    </dd>
                  </div>
                </dl>

                {!result.interestOnly && result.totalRepaid > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Interest accounts for{" "}
                    {formatPercent(result.totalInterest / result.totalRepaid)}{" "}
                    of everything you pay. The final {periodLabel}ly payment can
                    differ by a few cents to clear the balance exactly.
                  </p>
                ) : null}
              </CardContent>
            </Card>

            {result.interestOnly ? (
              <Alert>
                <Info className="size-4" />
                <AlertTitle>The balance never reduces</AlertTitle>
                <AlertDescription>
                  You pay {formatCurrency(result.periodicRepayment)} per{" "}
                  {periodLabel} and nothing comes off the principal, so you
                  still owe {formatCurrency(principal)} when the term ends. You
                  would need a further {formatCurrency(principal)} to clear it.
                  Interest-only periods are usually a temporary bridge while you
                  save a deposit.
                </AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>Amortisation schedule</CardTitle>
                <CardDescription>
                  Yearly totals across the {result.yearsToRepay} year term.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Year</TableHead>
                      <TableHead className="text-right">Principal</TableHead>
                      <TableHead className="text-right">Interest</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.yearly.map((row) => (
                      <TableRow key={row.year}>
                        <TableCell>{row.year}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.principalPaid)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(row.interestPaid)}
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
          </>
        ) : (
          <Alert variant="destructive">
            <Info className="size-4" />
            <AlertTitle>Check your loan details</AlertTitle>
            <AlertDescription>
              {allValid
                ? "We could not work out a repayment from those details."
                : "Enter a valid loan amount, interest rate and term to see your repayment."}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
