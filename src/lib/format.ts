// Number formatters for USD. Instantiated once at module scope rather than per
// render — constructing Intl objects is comparatively expensive.

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

// Shares of a total read better at one decimal. The rate formatter's three
// decimals are for inputs like 6.55%, not for "53.596% of the balance".
const shareFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Formats a dollar amount, e.g. 2528.2712 -> "$2,528.27". */
export function formatCurrency(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return currencyFormatter.format(value);
}

/** Formats a decimal rate, e.g. 0.0655 -> "6.55%". */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return percentFormatter.format(value);
}

/** Formats a proportion of a whole, e.g. 0.535963 -> "53.6%". */
export function formatShare(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return shareFormatter.format(value);
}
