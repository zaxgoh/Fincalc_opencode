import type { Metadata } from "next";

import { CompoundInterestCalculator } from "@/components/compound-interest-calculator";

export const metadata: Metadata = {
  title: "Compound Interest Calculator",
  description:
    "Project what your savings could grow to. See the future value of a starting deposit plus regular contributions, a year-by-year growth schedule, and how much compounding frequency actually changes the outcome.",
};

export default function CompoundInterestCalculatorPage() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-16">
        <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Compound interest calculator
        </h1>
        <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
          See what a starting balance becomes once compounding and regular
          contributions get to work. Adjust any field to project the balance,
          the total interest earned, and how the growth builds year by year.
        </p>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <CompoundInterestCalculator />
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-24">
        <p className="text-sm text-muted-foreground">
          This calculator is an estimate for general guidance only. It assumes a
          constant rate of return, which markets do not deliver in practice, and
          does not account for fees, taxes, or changes to your contributions.
          Projections are not a guarantee of future results. Consider speaking
          to a financial adviser before making a decision.
        </p>
      </section>
    </main>
  );
}
