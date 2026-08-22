import Icon from "./Icon";

/**
 * What a Server Action said. Every action in this app returns { ok, message },
 * so one component renders all of them.
 *
 * A failure stays where it happened -- it is the only explanation of what went
 * wrong, and these failures are usually the database refusing a payout, which
 * is the single most important message the app produces.
 */
export default function FormMessage({ state, className = "" }) {
  if (!state?.message) return null;

  const bad = state.ok === false;

  return (
    <p
      role="status"
      aria-live="polite"
      className={`flex items-start gap-2 rounded-xl px-3.5 py-3 text-base ${
        bad ? "bg-danger-soft text-danger" : "bg-in-soft text-in"
      } ${className}`.trim()}
    >
      <Icon name={bad ? "warning" : "check"} className="mt-0.5 size-5 shrink-0" />
      <span>{state.message}</span>
    </p>
  );
}
