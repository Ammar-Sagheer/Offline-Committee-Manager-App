"use client";

import { useActionState, useEffect, useState } from "react";
import { recordRepaymentAction } from "@/app/_lib/actions";
import Dialog from "@/app/_components/ui/Dialog";
import Field, { MoneyInput } from "@/app/_components/ui/Field";
import FormMessage from "@/app/_components/ui/FormMessage";
import SubmitButton from "@/app/_components/ui/SubmitButton";
import Icon from "@/app/_components/ui/Icon";
import { money } from "@/app/_lib/format-helpers";
import { today } from "@/app/_lib/date-helpers";

/**
 * Recording what somebody has paid back.
 *
 * The installment is offered, but the box is free -- paying more than the
 * installment is the whole point of how this committee works, and it should not
 * feel like fighting the app. The screen says plainly what paying more does:
 * it does not lower the monthly figure, it ends the thing sooner.
 */
export default function RepaymentDialog({ member, cycleNo, disabled }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(recordRepaymentAction, null);
  const [entered, setEntered] = useState("");

  // A refusal keeps the dialog open -- the explanation is the only part of the
  // interaction that matters. Success closes it.
  useEffect(() => {
    if (state?.ok) {
      setOpen(false);
      setEntered("");
    }
  }, [state]);

  const due = Number(member.installment_due ?? 0);
  const owed = Number(member.outstanding ?? 0);
  const typed = Number(String(entered).replace(/[,\s]/g, "")) || 0;
  const extra = typed > due ? typed - due : 0;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="btn px-3 py-1.5 text-sm disabled:opacity-40"
      >
        <Icon name="cash-in" className="size-4" />
        Record repayment
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Repayment from ${member.full_name}`}
        description={`He owes ${money(owed)} in total, and ${money(due, { paisa: true })} is due this month.`}
      >
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="member_id" value={member.id} />
          <input type="hidden" name="cycle_no" value={cycleNo} />

          <Field label="Amount paid" name="amount" required>
            <MoneyInput
              name="amount"
              required
              autoFocus
              value={entered}
              onChange={(event) => setEntered(event.target.value)}
              placeholder={String(Math.round(due))}
            />
          </Field>

          <div className="flex flex-wrap gap-2">
            {[due, due * 2, owed]
              .map((v) => Math.round(v))
              .filter((v, i, all) => v > 0 && all.indexOf(v) === i)
              .map((value, index) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEntered(String(value))}
                  className="btn px-3 py-1.5 text-sm"
                >
                  {index === 0 ? "This month's" : value === Math.round(owed) ? "Clear it all" : "Double"}
                  {" · "}
                  <span className="num">{money(value)}</span>
                </button>
              ))}
          </div>

          {extra > 0 ? (
            <p className="flex items-start gap-2 rounded-xl bg-in-soft px-3.5 py-3 text-base text-in">
              <Icon name="info" className="mt-0.5 size-5 shrink-0" />
              <span>
                <span className="num font-semibold">{money(extra)}</span> more than this month&rsquo;s
                installment. His monthly figure stays at{" "}
                <span className="num">{money(due, { paisa: true })}</span> — the committee just
                finishes earlier, and the money is back in the account sooner.
              </span>
            </p>
          ) : null}

          <Field label="Date paid" name="entry_date" type="date" defaultValue={today()} />
          <Field label="Note" name="note" placeholder="Optional — bank transfer, cash, who handed it over" />

          <FormMessage state={state} />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn">
              Cancel
            </button>
            <SubmitButton pendingLabel="Recording…">Record repayment</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
