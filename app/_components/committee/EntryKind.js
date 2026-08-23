import Icon from "@/app/_components/ui/Icon";

/** The kind of entry, as a word and an icon -- never as a colour on its own. */
export default function EntryKind({ entry }) {
  const map = {
    contribution: { label: "Contribution", chip: "chip-in", icon: "cash-in" },
    repayment: { label: "Repayment", chip: "chip-in", icon: "cash-in" },
    payout: { label: "Committee given", chip: "chip-out", icon: "cash-out" },
    adjustment: { label: "Adjustment", chip: "chip-quiet", icon: "info" },
  };
  const kind = map[entry.entry_type] ?? map.adjustment;

  return (
    <span className="flex flex-wrap items-center gap-2">
      <span className={`chip ${kind.chip}`}>
        <Icon name={kind.icon} className="size-4" />
        {kind.label}
      </span>
      {entry.reverses_entry_id ? (
        <span className="chip chip-quiet">
          <Icon name="undo" className="size-4" />
          reversal
        </span>
      ) : null}
      {entry.reversed_by_entry_id ? (
        <span className="chip chip-quiet">
          <Icon name="undo" className="size-4" />
          reversed
        </span>
      ) : null}
      {entry.override_reason ? (
        <span className="chip chip-bad" title={entry.override_reason}>
          <Icon name="warning" className="size-4" />
          overridden
        </span>
      ) : null}
      {entry.note ? <span className="text-sm text-text-light">{entry.note}</span> : null}
    </span>
  );
}
