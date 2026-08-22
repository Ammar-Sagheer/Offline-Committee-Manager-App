/**
 * A labelled input. Exists so every form in the app spells a field the same
 * way, and so the hint and the error have a settled place rather than being
 * arranged again on each screen.
 */
export default function Field({
  label,
  name,
  hint,
  children,
  required = false,
  className = "",
  ...rest
}) {
  const id = rest.id ?? name;

  return (
    <div className={className}>
      <label htmlFor={id} className="label">
        {label}
        {required ? <span className="ml-1 text-danger" aria-hidden="true">*</span> : null}
      </label>
      {children ?? (
        <input id={id} name={name} className="input" required={required} {...rest} />
      )}
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

/** A money field. Right-aligned, tabular, and it never gets a spinner. */
export function MoneyInput({ name, id, className = "", ...rest }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-light">
        Rs
      </span>
      <input
        id={id ?? name}
        name={name}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className={`input pl-11 text-right [font-variant-numeric:tabular-nums] ${className}`.trim()}
        {...rest}
      />
    </div>
  );
}
