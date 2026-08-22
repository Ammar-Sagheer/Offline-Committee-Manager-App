"use client";

import { useActionState, useEffect, useState } from "react";
import { createUserAction, resetPasswordAction, setUserActiveAction } from "@/app/_lib/actions";
import Dialog from "@/app/_components/ui/Dialog";
import Field from "@/app/_components/ui/Field";
import FormMessage from "@/app/_components/ui/FormMessage";
import SubmitButton from "@/app/_components/ui/SubmitButton";
import Icon from "@/app/_components/ui/Icon";
import { dayMonth } from "@/app/_lib/date-helpers";

export default function UserAdmin({ users, currentUserId, readOnly }) {
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState(null);

  const [addState, addAction] = useActionState(createUserAction, null);
  const [resetState, resetAction] = useActionState(resetPasswordAction, null);
  const [activeState, activeAction] = useActionState(setUserActiveAction, null);

  useEffect(() => { if (addState?.ok) setAdding(false); }, [addState]);
  useEffect(() => { if (resetState?.ok) setResetting(null); }, [resetState]);

  return (
    <>
      <ul className="divide-y divide-border">
        {users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-base font-medium">
                {u.full_name}
                {u.id === currentUserId ? (
                  <span className="chip chip-quiet ml-2">you</span>
                ) : null}
              </p>
              <p className="text-sm text-text-light">
                {u.username} ·{" "}
                {u.role === "manager" ? "full control" : "read-only"}
                {u.last_login_at
                  ? ` · last opened ${dayMonth(String(u.last_login_at).slice(0, 10))}`
                  : " · never signed in"}
              </p>
            </div>

            <span className={`chip ${u.is_active ? "chip-in" : "chip-quiet"}`}>
              <Icon name={u.is_active ? "check" : "blocked"} className="size-4" />
              {u.is_active ? "can sign in" : "switched off"}
            </span>

            {!readOnly ? (
              <div className="flex gap-2">
                <button type="button" onClick={() => setResetting(u)}
                        className="btn-quiet px-2 py-1.5 text-sm">
                  <Icon name="lock" className="size-4" />
                  Reset password
                </button>
                {u.id !== currentUserId ? (
                  <form action={activeAction}>
                    <input type="hidden" name="user_id" value={u.id} />
                    <input type="hidden" name="is_active" value={String(!u.is_active)} />
                    <SubmitButton variant="plain" pendingLabel="…" className="px-2 py-1.5 text-sm">
                      {u.is_active ? "Switch off" : "Switch on"}
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      {activeState?.message ? <FormMessage state={activeState} className="mx-6 mb-4" /> : null}

      {!readOnly ? (
        <div className="border-t border-border px-6 py-4">
          <button type="button" onClick={() => setAdding(true)} className="btn">
            <Icon name="plus" className="size-5" />
            Add a login
          </button>
        </div>
      ) : null}

      <Dialog open={adding} onClose={() => setAdding(false)} title="Add a login">
        <form action={addAction} className="space-y-4">
          <Field label="Their name" name="full_name" required autoFocus />
          <Field label="Username" name="username" required autoComplete="off"
                 hint="At least 3 characters. Capitals do not matter when signing in." />
          <Field label="Password" name="password" type="password" required autoComplete="new-password"
                 hint="At least 6 characters. Tell them what you set." />

          <div>
            <label htmlFor="role" className="label">What they can do</label>
            <select id="role" name="role" className="input" defaultValue="viewer">
              <option value="viewer">Read-only — can look at everything, change nothing</option>
              <option value="manager">Full control — can record and reverse everything</option>
            </select>
          </div>

          <FormMessage state={addState} />

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="btn">Cancel</button>
            <SubmitButton pendingLabel="Adding…">Add login</SubmitButton>
          </div>
        </form>
      </Dialog>

      <Dialog open={Boolean(resetting)} onClose={() => setResetting(null)}
              title={resetting ? `Reset ${resetting.full_name}'s password` : ""}>
        <form action={resetAction} className="space-y-4">
          <input type="hidden" name="user_id" value={resetting?.id ?? ""} />
          <Field label="New password" name="new_password" type="password" required
                 autoComplete="new-password" hint="At least 6 characters. Tell them what you set." />
          <FormMessage state={resetState} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setResetting(null)} className="btn">Cancel</button>
            <SubmitButton pendingLabel="Resetting…">Reset it</SubmitButton>
          </div>
        </form>
      </Dialog>
    </>
  );
}
