"use client";

import { useActionState, useState } from "react";
import { setupAction } from "@/app/_lib/actions";
import Field, { MoneyInput } from "@/app/_components/ui/Field";
import FormMessage from "@/app/_components/ui/FormMessage";
import SubmitButton from "@/app/_components/ui/SubmitButton";
import Icon from "@/app/_components/ui/Icon";
import { money } from "@/app/_lib/format-helpers";

const BLANK = ["", "", "", "", "", "", "", "", "", ""];

export default function SetupForm() {
  const [state, formAction] = useActionState(setupAction, null);
  const [names, setNames] = useState(BLANK);

  // Live arithmetic while the numbers are being typed, because the figure that
  // matters here -- what is already in the account -- is the one people get
  // wrong, and seeing it appear is how a typo gets noticed.
  const [contribution, setContribution] = useState("4000");
  const [monthsCollected, setMonthsCollected] = useState("13");

  const filled = names.filter((n) => n.trim()).length;
  const opening =
    (Number(String(contribution).replace(/[,\s]/g, "")) || 0) *
    (Number(monthsCollected) || 0) *
    filled;

  const setName = (index, value) =>
    setNames((current) => current.map((n, i) => (i === index ? value : n)));

  return (
    <form action={formAction} className="space-y-6">
      {/* ---------------------------------------------------------------- */}
      <section className="card p-6">
        <h2 className="text-lg">Your login</h2>
        <p className="mt-1 mb-5 text-sm text-text-light">
          This first account is the committee manager and has full control. Read-only logins for
          anyone else are added later, in Settings.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your name" name="full_name" required defaultValue="Muhammad Arshad" />
          <Field label="Username" name="username" required autoComplete="username" defaultValue="arshad" />
          <Field label="Password" name="password" type="password" required autoComplete="new-password"
                 hint="At least 6 characters." />
          <Field label="Password again" name="confirm" type="password" required autoComplete="new-password" />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="card p-6">
        <h2 className="text-lg">The members</h2>
        <p className="mt-1 mb-5 text-sm text-text-light">
          Everyone currently in the committee. Leave a box empty if there are fewer than ten;
          more can be added later.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {names.map((name, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-6 shrink-0 text-right text-sm text-text-light num">{index + 1}</span>
              <input
                name="member_name"
                value={name}
                onChange={(event) => setName(index, event.target.value)}
                placeholder={`Member ${index + 1}`}
                className="input"
                autoComplete="off"
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setNames((current) => [...current, ""])}
          className="btn-quiet mt-4"
        >
          <Icon name="plus" className="size-5" />
          Add another
        </button>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="card p-6">
        <h2 className="text-lg">The committee&rsquo;s rules</h2>
        <p className="mt-1 mb-5 text-sm text-text-light">
          All of these can be changed later by a vote. Nothing already recorded is rewritten when
          they are.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Started in" name="start_month" required
                 hint="The first month money was collected.">
            <input type="month" id="start_month" name="start_month" required
                   defaultValue="2025-07" className="input" />
          </Field>

          <Field label="Months already collected" name="months_collected" required
                 type="number" min="0" max="600"
                 value={monthsCollected}
                 onChange={(event) => setMonthsCollected(event.target.value)}
                 hint="Not counting the month now in progress." />

          <Field label="Monthly contribution, each person" name="contribution" required>
            <MoneyInput name="contribution" required value={contribution}
                        onChange={(event) => setContribution(event.target.value)} />
          </Field>

          <Field label="Agreed withdrawal amount" name="max_payout" required>
            <MoneyInput name="max_payout" required defaultValue="145000" />
          </Field>

          <Field label="Repaid over" name="term_months" required type="number" min="1" max="120"
                 defaultValue="15" hint="Months. The withdrawer pays this on top of his contribution." />

          <Field label="Cushion the account must keep" name="safety_buffer" required>
            <MoneyInput name="safety_buffer" required defaultValue="50000" />
          </Field>
        </div>

        <label className="mt-5 flex items-start gap-3 rounded-xl bg-surface-alt p-4">
          <input type="checkbox" name="mark_all_paid" defaultChecked className="mt-1 size-5 accent-[var(--color-primary)]" />
          <span className="text-base">
            <span className="font-medium">Everyone paid every month so far.</span>
            <span className="mt-1 block text-sm text-text-light">
              Ticks all {filled || 0} × {monthsCollected || 0} contributions. Any month somebody
              actually missed is un-ticked afterwards on the month screen.
            </span>
          </span>
        </label>

        {opening > 0 ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-primary-soft px-4 py-3 text-base text-primary">
            <Icon name="info" className="mt-0.5 size-5 shrink-0" />
            <span>
              That gives an opening balance of{" "}
              <span className="num font-semibold">{money(opening)}</span> — {filled} members ×{" "}
              {monthsCollected} months × <span className="num">{money(contribution)}</span>.
            </span>
          </p>
        ) : null}
      </section>

      <FormMessage state={state} />

      <div className="flex justify-end">
        <SubmitButton pendingLabel="Setting up…">Set the committee up</SubmitButton>
      </div>
    </form>
  );
}
