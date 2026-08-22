"use client";

import { useActionState } from "react";
import { markContributionAction } from "@/app/_lib/actions";
import SubmitButton from "@/app/_components/ui/SubmitButton";
import Icon from "@/app/_components/ui/Icon";

/**
 * Ten of these on the month screen, pressed once each. The whole job is one
 * press, so it is a button in the row rather than a form to open -- this is the
 * thing done most often in the app.
 */
export default function ContributionButton({ memberId, cycleNo, memberName, disabled }) {
  const [state, formAction] = useActionState(markContributionAction, null);

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="member_id" value={memberId} />
      <input type="hidden" name="cycle_no" value={cycleNo} />
      <SubmitButton variant="plain" pendingLabel="…" disabled={disabled} className="px-3 py-1.5 text-sm">
        <Icon name="check" className="size-4" />
        Mark paid
      </SubmitButton>
      {state?.ok === false ? (
        <span className="max-w-56 text-right text-sm text-danger">{state.message}</span>
      ) : null}
      <span className="sr-only">Mark {memberName} paid for month {cycleNo}</span>
    </form>
  );
}
