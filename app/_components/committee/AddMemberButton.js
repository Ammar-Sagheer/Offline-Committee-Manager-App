"use client";

import { useActionState, useEffect, useState } from "react";
import { addMemberAction } from "@/app/_lib/actions";
import Dialog from "@/app/_components/ui/Dialog";
import Field from "@/app/_components/ui/Field";
import FormMessage from "@/app/_components/ui/FormMessage";
import SubmitButton from "@/app/_components/ui/SubmitButton";
import Icon from "@/app/_components/ui/Icon";

/**
 * Adding a member is set-up-once work, not everyday work, so it sits behind one
 * button rather than as a standing form. A permanent four-field form for the
 * rare job crowds out the table, which is what the page is actually for.
 */
export default function AddMemberButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(addMemberAction, null);

  useEffect(() => {
    if (state?.ok) setOpen(false);
  }, [state]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-primary">
        <Icon name="plus" className="size-5" />
        Add a member
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Add a member"
        description="He starts from zero. Any months he paid before today are recorded on the month screens."
      >
        <form action={formAction} className="space-y-4">
          <Field label="Full name" name="full_name" required autoFocus />
          <Field label="Phone" name="phone" hint="Optional." />
          <Field label="Note" name="notes" hint="Optional." />

          <p className="flex items-start gap-2 rounded-xl bg-surface-alt px-3.5 py-3 text-sm text-text-light">
            <Icon name="info" className="mt-0.5 size-4 shrink-0" />
            <span>
              Adding a member changes what the committee can afford: one more contribution comes
              in every month, but the turn also comes round less often. The dashboard recalculates
              as soon as this is saved.
            </span>
          </p>

          <FormMessage state={state} />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn">
              Cancel
            </button>
            <SubmitButton pendingLabel="Adding…">Add member</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
