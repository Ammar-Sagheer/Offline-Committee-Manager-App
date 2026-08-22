/**
 * Money and numbers on screen. Safe on the server AND the client, which is why
 * it is its own module -- helpers.js reads cookies and can never enter a client
 * bundle, and before this split two parts of an app wrote money two different
 * ways.
 */
import { siteConfig } from "./siteConfig";

const grouped = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/**
 * "Rs 124,000". Always whole rupees, never paisa.
 *
 * Nobody in this committee hands over 67  and nobody wants to read them.
 * That is safe to do here only because the rounding happens at the source --
 * migration 012 keeps every stored amount and every installment whole, and a
 * check constraint holds it there. Rounding at the point of display instead
 * would mean ten rows each rounded to the rupee no longer adding up to the
 * rounded total, in an app whose entire job is figures that add up.
 */
export function money(value) {
  return `${siteConfig.currency} ${grouped.format(Math.round(Number(value ?? 0)))}`;
}

/** The same, but negatives read as "-Rs 12,000" rather than "Rs -12,000". */
export function signedMoney(value) {
  const n = Number(value ?? 0);
  return n < 0 ? `-${money(Math.abs(n))}` : money(n);
}

/** No currency mark. For a column whose heading already says rupees. */
export function amount(value) {
  return grouped.format(Math.round(Number(value ?? 0)));
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
