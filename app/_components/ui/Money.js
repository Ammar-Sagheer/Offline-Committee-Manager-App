import { money, amount, signedMoney } from "@/app/_lib/format-helpers";

/**
 * A figure on screen.
 *
 * Its one job is that money never wraps. A table cell gets that from .td-num;
 * a sentence does not, and "Rs 2,500,000" breaking after the "Rs" reads for a
 * moment as two separate figures.
 *
 * `tone` pairs the colour with a word or an arrow at the call site -- colour is
 * never the only thing carrying the meaning.
 */
export default function Money({
  value,
  bare = false,
  signed = false,
  paisa = false,
  tone,
  className = "",
}) {
  const text = bare
    ? amount(value, { paisa })
    : signed
      ? signedMoney(value)
      : money(value, { paisa });

  const toneClass =
    tone === "in" ? "text-in"
    : tone === "out" ? "text-out"
    : tone === "bad" ? "text-danger"
    : tone === "quiet" ? "text-text-light"
    : "";

  return <span className={`num ${toneClass} ${className}`.trim()}>{text}</span>;
}
