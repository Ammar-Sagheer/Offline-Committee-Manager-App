/**
 * Dates. Safe on the server AND the client.
 *
 * Everything here takes a plain 'YYYY-MM-DD' string, because that is what the
 * driver is configured to hand back for a `date` column. A calendar month with
 * no time and no zone should never become a JavaScript Date on the way to a
 * screen -- that is how "August 2026" turns into "July 2026" for anyone east of
 * Greenwich.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SHORT = MONTHS.map((m) => m.slice(0, 3));

function parts(isoDate) {
  if (!isoDate) return null;
  const [y, m, d] = String(isoDate).slice(0, 10).split("-").map(Number);
  if (!y || !m) return null;
  return { y, m, d: d || 1 };
}

/** '2026-08-01' -> 'August 2026' */
export function monthName(isoDate) {
  const p = parts(isoDate);
  return p ? `${MONTHS[p.m - 1]} ${p.y}` : "—";
}

/** '2026-08-01' -> 'Aug 2026' */
export function monthShort(isoDate) {
  const p = parts(isoDate);
  return p ? `${SHORT[p.m - 1]} ${p.y}` : "—";
}

/** '2026-08-21' -> '21 Aug 2026' */
export function dayMonth(isoDate) {
  const p = parts(isoDate);
  return p ? `${p.d} ${SHORT[p.m - 1]} ${p.y}` : "—";
}

/** Today, as the string an <input type="date"> and the database both accept. */
export function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The first of this month, same format. */
export function thisMonthStart() {
  return `${today().slice(0, 7)}-01`;
}

/** Steps a 'YYYY-MM-01' string by whole months without going near a Date. */
export function addMonths(isoDate, count) {
  const p = parts(isoDate);
  if (!p) return null;
  const zero = p.y * 12 + (p.m - 1) + count;
  const y = Math.floor(zero / 12);
  const m = (zero % 12) + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
