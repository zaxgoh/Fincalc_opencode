/**
 * Tolerant numeric parsing for calculator inputs.
 *
 * Strips currency symbols, separators and stray spaces so a pasted "$400,000"
 * still works, while returning NaN for input that is not a number at all so
 * the field can be flagged invalid.
 */
export function parseNumeric(raw: string): number {
  const parsed = Number.parseFloat(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
