"use client";

import { useActionState, useState } from "react";
import { updateSettingsAction } from "@/app/_lib/actions";
import Field, { MoneyInput } from "@/app/_components/ui/Field";
import FormMessage from "@/app/_components/ui/FormMessage";
import SubmitButton from "@/app/_components/ui/SubmitButton";
import Icon from "@/app/_components/ui/Icon";
import { money } from "@/app/_lib/format-helpers";

export default function SettingsForm({ settings, maxSafe, readOnly }) {
  const [state, formAction] = useActionState(updateSettingsAction, null);
  const [ceiling, setCeiling] = useState(String(Math.round(settings.max_payout_amount)));

  const typed = Number(String(ceiling).replace(/[,\s]/g, "")) || 0;
  const overSafe = typed > maxSafe;

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Monthly contribution, each person" name="contribution_amount">
          <MoneyInput name="contribution_amount"
                      defaultValue={Math.round(settings.contribution_amount)} disabled={readOnly} />
        </Field>

        <Field label="Agreed withdrawal amount" name="max_payout_amount">
          <MoneyInput name="max_payout_amount" value={ceiling} disabled={readOnly}
                      onChange={(event) => setCeiling(event.target.value)} />
        </Field>

        <Field label="Repaid over (months)" name="repayment_term_months" type="number"
               min="1" max="120" defaultValue={settings.repayment_term_months} disabled={readOnly}
               hint="Shorter means money comes back sooner, so more can go out." />

        <Field label="Cushion the account must keep" name="safety_buffer">
          <MoneyInput name="safety_buffer" defaultValue={Math.round(settings.safety_buffer)}
                      disabled={readOnly} />
        </Field>

        <Field label="Check this many months ahead" name="projection_horizon_months" type="number"
               min="6" max="240" step="6" defaultValue={settings.projection_horizon_months}
               disabled={readOnly}
               hint="How far the solvency check looks before allowing a withdrawal." />
      </div>

      {overSafe ? (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-base text-warning">
          <Icon name="warning" className="mt-0.5 size-5 shrink-0" />
          <span>
            <span className="num font-semibold">{money(typed)}</span> is above what the account can
            currently carry — <span className="num font-semibold">{money(maxSafe)}</span>. Saving
            this is allowed; it is the committee&rsquo;s agreed figure, not a promise the account
            can meet it. Each individual withdrawal is still checked on its own, and refused unless
            a reason is written down.
          </span>
        </p>
      ) : null}

      <FormMessage state={state} />

      {!readOnly ? (
        <div className="flex justify-end">
          <SubmitButton>Save the rules</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
