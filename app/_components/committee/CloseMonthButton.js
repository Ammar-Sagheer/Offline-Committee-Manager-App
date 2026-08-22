"use client";

import { useActionState, useEffect, useState } from "react";
import { closeCycleAction } from "@/app/_lib/actions";
import Dialog from "@/app/_components/ui/Dialog";
import FormMessage from "@/app/_components/ui/FormMessage";
import SubmitButton from "@/app/_components/ui/SubmitButton";
import Icon from "@/app/_components/ui/Icon";

/**
 * Locking a month.
 *
 * Closing with contributions still missing is allowed -- people genuinely do pay
 * late, and a database that refuses to move on is one somebody works around. But
 * it is never silent: whoever has not paid is named here before the button is
 * pressed, and the month can be reopened afterwards.
 */
export default function CloseMonthButton({ cycleNo, unpaidNames, payoutDone }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(closeCycleAction, null);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn">
        <Icon name="lock" className="size-5" />
        Close this month
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Close committee month ${cycleNo}?`}
        description="Nothing can be posted into a closed month until it is reopened."
      >
        {unpaidNames.length > 0 ? (
          <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-3 text-base text-warning">
            <Icon name="warning" className="mt-0.5 size-5 shrink-0" />
            <span>
              {unpaidNames.length === 1
                ? `${unpaidNames[0]} has not paid this month.`
                : `${unpaidNames.length} people have not paid: ${unpaidNames.join(", ")}.`}{" "}
              Closing anyway is fine — reopen the month when the money arrives and record it where
              it belongs.
            </span>
          </p>
        ) : null}

        {!payoutDone ? (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-3.5 py-3 text-base text-warning">
            <Icon name="warning" className="mt-0.5 size-5 shrink-0" />
            <span>Nobody has been given the committee this month yet.</span>
          </p>
        ) : null}

        {unpaidNames.length === 0 && payoutDone ? (
          <p className="flex items-start gap-2 rounded-xl bg-in-soft px-3.5 py-3 text-base text-in">
            <Icon name="check" className="mt-0.5 size-5 shrink-0" />
            <span>Everyone has paid and the committee has been given out. This month is done.</span>
          </p>
        ) : null}

        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="cycle_no" value={cycleNo} />
          <FormMessage state={state} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn">
              Not yet
            </button>
            <SubmitButton pendingLabel="Closing…">
              Close month {cycleNo}, open {cycleNo + 1}
            </SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
