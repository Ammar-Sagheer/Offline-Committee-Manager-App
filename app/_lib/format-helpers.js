/**
 * Money and numbers on screen. Safe on the server AND the client, which is why
 * it is its own module -- helpers.js reads cookies and can never enter a client
 * bundle, and before this split two parts of an app wrote money two different
 * ways.
 */
import { siteConfig } from "./siteConfig";

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const groupedPaisa = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * "Rs 124,000". Whole rupees unless there really are paisa, because a column
 * reading 5,556 / 332.46 / 1,033.80 is three shapes in a column of tabular
 * numerals, which is exactly what tabular numerals exist to prevent.
 */
export function money(value, { paisa = false } = {}) {
  const n = Number(value ?? 0);
  const needsPaisa = paisa || Math.abs(n % 1) > 0.004;
  const body = needsPaisa ? groupedPaisa.format(n) : grouped.format(Math.round(n));
  return `${siteConfig.currency} ${body}`;
}

/** The same, but negatives read as "-Rs 12,000" rather than "Rs -12,000". */
export function signedMoney(value) {
  const n = Number(value ?? 0);
  return n < 0 ? `-${money(Math.abs(n))}` : money(n);
}

/** No currency mark. For a column whose heading already says rupees. */
export function amount(value, { paisa = false } = {}) {
  const n = Number(value ?? 0);
  const needsPaisa = paisa || Math.abs(n % 1) > 0.004;
  return needsPaisa ? groupedPaisa.format(n) : grouped.format(Math.round(n));
}

export function percent(value, digits = 0) {
  return `${Number(value ?? 0).toFixed(digits)}%`;
}

/** "3 months" / "1 month" / "-". */
export function months(value) {
  const n = Number(value ?? 0);
  if (!n) return "—";
  return `${n} ${n === 1 ? "month" : "months"}`;
}

/** Parses what someone typed into a money field. Returns null if it is not a number. */
export function parseAmount(input) {
  if (input === null || input === undefined) return null;
  const cleaned = String(input).replace(/[,\s]/g, "").replace(/^Rs\.?/i, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
