import { ArrowRight, Check, Landmark, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const features = [
  {
    icon: Landmark,
    title: "Mortgage Repayments Calculator",
    description:
      "Find your real monthly cost, and see exactly how much of every payment goes to the bank rather than back to you.",
    points: [
      "Monthly repayment for any rate and term",
      "Full amortisation schedule, month by month",
      "Interest vs principal split on each payment",
      "Total interest repaid across the whole term",
    ],
  },
  {
    icon: TrendingUp,
    title: "Compound Interest Calculator",
    description:
      "Watch a starting balance grow, and see how regular contributions and compounding frequency change the outcome.",
    points: [
      "Projected balance across any time horizon",
      "Monthly, quarterly or annual contributions",
      "Compare compounding frequency side by side",
      "Total contributed vs total interest earned",
    ],
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 py-24 text-center sm:py-32">
        <Badge variant="secondary">Mortgage &amp; investing calculators</Badge>

        <h1 className="max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Know what you&apos;ll pay. See what you&apos;ll earn.
        </h1>

        <p className="max-w-2xl text-pretty text-lg text-muted-foreground">
          Fincalc answers the two questions behind most financial decisions —
          what a mortgage really costs you, and what compounding actually does
          to your savings.
        </p>

        <div className="flex flex-col items-center gap-4">
          <Button
            size="lg"
            nativeButton={false}
            render={<a href="#calculators" />}
          >
            Explore the calculators
            <ArrowRight data-icon="inline-end" />
          </Button>
          <p className="text-sm text-muted-foreground">
            No sign-up. Nothing leaves your browser.
          </p>
        </div>
      </section>

      <section
        id="calculators"
        className="mx-auto flex w-full max-w-5xl scroll-mt-8 flex-col gap-8 px-6 pb-24"
      >
        <div className="flex flex-col gap-2 text-center">
          <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            Two calculators, one clear picture
          </h2>
          <p className="mx-auto max-w-2xl text-pretty text-muted-foreground">
            Both are on the way. Here&apos;s what each one will do for you.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {features.map(({ icon: Icon, title, description, points }) => (
            <Card key={title}>
              <CardHeader>
                <CardTitle
                  className="flex items-center gap-2"
                  role="heading"
                  aria-level={3}
                >
                  <Icon className="size-5 shrink-0 text-muted-foreground" />
                  {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>

              <CardContent>
                <ul className="flex flex-col gap-2.5">
                  {points.map((point) => (
                    <li
                      key={point}
                      className="flex items-start gap-2 text-muted-foreground"
                    >
                      <Check className="mt-0.5 size-4 shrink-0" />
                      {point}
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Badge variant="outline">Coming soon</Badge>
              </CardFooter>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
