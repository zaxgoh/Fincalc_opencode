import type { Metadata } from "next";

import { MortgageRepaymentCalculator } from "@/components/mortgage-repayment-calculator";

export const metadata: Metadata = {
  title: "Mortgage Repayments Calculator",
  description:
    "Calculate your mortgage repayments. See your periodic repayment, total interest and a year-by-year amortisation schedule for weekly, fortnightly or monthly payments.",
};

export default function MortgageRepaymentsCalculatorPage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-16">
        <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Mortgage repayments calculator
        </h1>
        <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
          Work out what a loan really costs you. Enter an amount, rate and term
          to see your repayment, the total interest you will pay, and how the
          balance reduces year by year.
        </p>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <MortgageRepaymentCalculator />
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <p className="text-sm text-muted-foreground">
          This calculator is an estimate for general guidance only. It does not
          account for fees, insurance, rate changes, or early repayment charges.
          Check with a lender or financial adviser before making a decision.
        </p>
      </section>
    </main>
  );
}
