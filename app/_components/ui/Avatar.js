/**
 * A name, turned into a small coloured circle -- nothing looked up, nothing
 * stored. The colour is picked from the name itself, so the same person is
 * always the same colour without a column to keep in sync.
 *
 * Purely decorative next to a name that is already text, so it is
 * aria-hidden the same way Icon.js is.
 */
const PALETTE = [
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-sky-100", text: "text-sky-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-teal-100", text: "text-teal-700" },
  { bg: "bg-pink-100", text: "text-pink-700" },
  { bg: "bg-indigo-100", text: "text-indigo-700" },
  { bg: "bg-lime-100", text: "text-lime-700" },
  { bg: "bg-cyan-100", text: "text-cyan-700" },
];

function initials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function paletteFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length];
}

export default function Avatar({ name, className = "size-8" }) {
  const { bg, text } = paletteFor(name);

  return (
    <span
      aria-hidden="true"
      className={`inline-flex shrink-0 items-center justify-center rounded-full text-sm font-semibold ${bg} ${text} ${className}`}
    >
      {initials(name)}
    </span>
  );
}
