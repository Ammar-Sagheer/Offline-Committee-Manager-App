"use client";

import { useActionState, useEffect, useState } from "react";
import { reopenCycleAction } from "@/app/_lib/actions";
import Dialog from "@/app/_components/ui/Dialog";
import FormMessage from "@/app/_components/ui/FormMessage";
import SubmitButton from "@/app/_components/ui/SubmitButton";
import Icon from "@/app/_components/ui/Icon";

export default function ReopenMonthButton({ cycleNo }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(reopenCycleAction, null);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn">
        <Icon name="unlock" className="size-5" />
        Reopen
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Reopen committee month ${cycleNo}?`}
        description="So a late payment can be filed where it actually belongs."
      >
        <p className="text-base">
          Later months stay as they are. The closing figures for every month after this one will
          change as soon as anything new is recorded here — which is the point, but it is worth
          knowing before anyone compares a printed sheet against the screen.
        </p>

        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="cycle_no" value={cycleNo} />
          <FormMessage state={state} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn">Leave it closed</button>
            <SubmitButton pendingLabel="Reopening…">Reopen month {cycleNo}</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
