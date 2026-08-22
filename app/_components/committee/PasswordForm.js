"use client";

import { useActionState } from "react";
import { changePasswordAction } from "@/app/_lib/actions";
import Field from "@/app/_components/ui/Field";
import FormMessage from "@/app/_components/ui/FormMessage";
import SubmitButton from "@/app/_components/ui/SubmitButton";

export default function PasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Current password" name="old_password" type="password" required
               autoComplete="current-password" />
        <Field label="New password" name="new_password" type="password" required
               autoComplete="new-password" hint="At least 6 characters." />
        <Field label="New password again" name="confirm" type="password" required
               autoComplete="new-password" />
      </div>
      <FormMessage state={state} />
      <div className="flex justify-end">
        <SubmitButton pendingLabel="Changing…">Change password</SubmitButton>
      </div>
    </form>
  );
}
