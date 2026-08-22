import Icon from "./Icon";

/**
 * One figure with its name. The figure is larger than the label, always -- a
 * number someone verifies must never be smaller than the word describing it.
 */
export default function StatCard({ label, value, sub, tone = "neutral", icon, footer }) {
  const toneClass =
    tone === "in" ? "text-in"
    : tone === "out" ? "text-out"
    : tone === "bad" ? "text-danger"
    : tone === "warn" ? "text-warning"
    : "text-heading";

  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="stat-label">{label}</p>
        {icon ? <Icon name={icon} className={`size-5 shrink-0 ${toneClass}`} /> : null}
      </div>
      <p className={`stat-value ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-1.5 text-sm text-text-light">{sub}</p> : null}
      {footer}
    </div>
  );
}
