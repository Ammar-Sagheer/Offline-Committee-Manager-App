"use client";

import { useEffect, useRef } from "react";
import Icon from "./Icon";

/**
 * A modal built on <dialog>, with three things learned the hard way.
 *
 * 1. No click-outside-to-close on anything holding a form. A click fires on the
 *    nearest common ancestor of mousedown and mouseup, so selecting text in a
 *    field and releasing a few pixels past the panel edge is indistinguishable
 *    from a backdrop click -- and silently throws away a half-typed entry.
 *
 * 2. Typography is reset on the panel. <dialog> paints in the top layer so its
 *    DOM position does not constrain its layout, but inherited properties still
 *    come down the tree -- and a confirm dialog usually renders inside the
 *    right-aligned, whitespace-nowrap table cell whose button opened it, which
 *    runs the confirmation sentence straight off its own panel.
 *
 * 3. A refusal keeps it open. Most of what this app does can be turned down by
 *    the database, and the sentence explaining why is the only part of the
 *    interaction that matters. Closing on failure throws it away.
 */
export default function Dialog({ open, onClose, title, description, children, width = "32rem" }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handleCancel = (event) => {
      // Escape. Let it through, but route it via onClose so the parent's state
      // and the element's own state cannot drift apart.
      event.preventDefault();
      onClose?.();
    };
    el.addEventListener("cancel", handleCancel);
    return () => el.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      style={{ maxWidth: width }}
      className="w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface p-0
                 text-left text-text backdrop:bg-black/40
                 [white-space:normal] [text-align:start]"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-lg">{title}</h2>
          {description ? <p className="mt-1 text-sm text-text-light">{description}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="btn-quiet -mr-2 -mt-1 shrink-0 px-2 py-1"
          aria-label="Close"
          title="Close"
        >
          <Icon name="cross" className="size-5" />
        </button>
      </div>
      <div className="px-5 py-5">{children}</div>
    </dialog>
  );
}
