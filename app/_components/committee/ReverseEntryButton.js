"use client";

import { useActionState, useEffect, useState } from "react";
import { reverseEntryAction } from "@/app/_lib/actions";
import Dialog from "@/app/_components/ui/Dialog";
import FormMessage from "@/app/_components/ui/FormMessage";
import SubmitButton from "@/app/_components/ui/SubmitButton";
import Icon from "@/app/_components/ui/Icon";
import { money } from "@/app/_lib/format-helpers";

const WHAT = {
  contribution: "contribution",
  repayment: "repayment",
  payout: "committee withdrawal",
  adjustment: "adjustment",
};

/**
 * Correcting something. The confirmation is a dialog, never inline.
 *
 * An inline "are you sure?" replaces a small button with a three-line block, so
 * the row grows and every row below it jumps down the page -- on a list, the row
 * you were aiming at moves while you are reading the question. A dialog costs
 * nothing in the row, traps focus, closes on Escape, and leaves the page still.
 */
export default function ReverseEntryButton({ entry }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(reverseEntryAction, null);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-quiet px-2 py-1.5 text-sm"
        aria-label={`Reverse this ${WHAT[entry.entry_type]}`}
        title="Reverse this entry"
      >
        <Icon name="undo" className="size-4" />
        Reverse
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Reverse this ${WHAT[entry.entry_type] ?? "entry"}?`}
      >
        <p className="text-base">
          This writes the opposite entry for{" "}
          <span className="num font-semibold">{money(entry.amount)}</span> against{" "}
          <span className="font-semibold">{entry.full_name}</span>. Both entries stay on his
          statement and cancel each other out — nothing is ever deleted from the ledger.
        </p>

        {entry.entry_type === "payout" ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-out-soft px-3.5 py-3 text-base text-out">
            <Icon name="warning" className="mt-0.5 size-5 shrink-0" />
            <span>
              This also cancels the repayment schedule that came with it, and frees the month up so
              the committee can be recorded against somebody else.
            </span>
          </p>
        ) : null}

        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="entry_id" value={entry.id} />
          <div>
            <label htmlFor={`reason-${entry.id}`} className="label">
              Why is it being reversed?
            </label>
            <input
              id={`reason-${entry.id}`}
              name="note"
              required
              minLength={3}
              autoFocus
              placeholder="e.g. recorded against the wrong person"
              className="input"
            />
            <p className="hint">This stays on the record beside both entries.</p>
          </div>

          <FormMessage state={state} />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn">
              Keep it
            </button>
            <SubmitButton variant="danger" pendingLabel="Reversing…">
              Reverse it
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
