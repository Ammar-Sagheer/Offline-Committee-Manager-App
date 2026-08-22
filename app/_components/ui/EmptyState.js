import Icon from "./Icon";

/**
 * A screen with nothing on it says what to do next and gives the button to do
 * it, rather than showing an empty table with headings.
 *
 * `filtered` distinguishes "nothing yet" from "nothing matching this" -- they
 * need different words and different ways out.
 */
export default function EmptyState({ icon = "info", title, children, action, filtered = false }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-surface-sunk text-text-light">
        <Icon name={filtered ? "info" : icon} className="size-6" />
      </span>
      <h3 className="text-lg">{title}</h3>
      {children ? <p className="max-w-md text-base text-text-light">{children}</p> : null}
      {action}
    </div>
  );
}
