"use client";

import { useActionState } from "react";
import { signInAction } from "@/app/_lib/actions";
import Field from "@/app/_components/ui/Field";
import FormMessage from "@/app/_components/ui/FormMessage";
import SubmitButton from "@/app/_components/ui/SubmitButton";

export default function LoginForm() {
  const [state, formAction] = useActionState(signInAction, null);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Username" name="username" autoComplete="username" required autoFocus />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />
      <FormMessage state={state} />
      <SubmitButton className="w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
