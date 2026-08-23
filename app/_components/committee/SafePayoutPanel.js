import { monthName } from "@/app/_lib/date-helpers";
import { money } from "@/app/_lib/format-helpers";
import { getPayoutLevers } from "@/app/_lib/data-service";
import Icon from "@/app/_components/ui/Icon";

/**
 * The advice panel, and the reason this app exists rather than a spreadsheet.
 *
 * A committee like this one has a timing problem that the bank balance cannot
 * show. Ten members means the turn comes round every ten months, but a
 * withdrawal is repaid over fifteen -- so for over a year, full-size payouts go
 * out while the repayment stream is still building up behind them, and the
 * savings already banked have to cover the gap. Half a million rupees in the
 * account looks like plenty right up to the month it is not.
 *
 * So the panel says three things, in this order: what is affordable now, when
 * and how badly the agreed amount breaks, and what would have to change. And it
 * says clearly that the squeeze is temporary, because "never" and "not yet"
 * call for completely different decisions.
 */
export default async function SafePayoutPanel({ summary, className = "" }) {
  const levers = await getPayoutLevers();
  const affordable = levers.is_affordable;

  return (
    <section
      className={`card overflow-hidden ${className}`.trim()}
      aria-labelledby="advice-heading"
    >
      <div
        className={`flex items-start gap-3 border-b px-6 py-5 ${
          affordable ? "border-border bg-in-soft" : "border-border bg-out-soft"
        }`}
      >
        <Icon
          name={affordable ? "check" : "warning"}
          className={`mt-0.5 size-6 shrink-0 ${affordable ? "text-in" : "text-out"}`}
        />
        <div className="min-w-0">
          <h2 id="advice-heading" className="text-lg">
            {affordable
              ? `The agreed ${money(levers.ceiling)} is affordable`
              : `The agreed ${money(levers.ceiling)} is more than the committee can carry`}
          </h2>
          <p className="mt-1.5 text-base">
            {affordable ? (
              <>
                Handing over{" "}
                <span className="num font-semibold">{money(levers.ceiling)}</span> every month
                leaves the account at its lowest on{" "}
                <span className="num font-semibold">{money(summary.trough)}</span> in{" "}
                {monthName(summary.trough_month)} — still above the{" "}
                <span className="num">{money(summary.safety_buffer)}</span> cushion.
              </>
            ) : (
              <>
                Keeping it up runs the account down to{" "}
                <span className="num font-semibold text-danger">{money(summary.trough)}</span> by{" "}
                {monthName(summary.trough_month)}, about {summary.months_to_trough} months from now.
                The most it can afford each month is{" "}
                <span className="num font-semibold">{money(levers.max_payout_now)}</span> —{" "}
                <span className="num">{money(levers.shortfall)}</span> less.
              </>
            )}
          </p>
        </div>
      </div>

      {!affordable ? (
        <div className="px-6 py-5">
          <p className="mb-4 text-base text-text-light">
            This is a timing problem, not a shortage. With {summary.member_count} members the turn
            comes round every {summary.member_count} months, but a withdrawal is repaid over{" "}
            {summary.repayment_term} — so full-size payouts go out for over a year while the
            repayments behind them are still building up. Any one of these closes the gap:
          </p>

          <ul className="grid gap-3 sm:grid-cols-3">
            <li className="rounded-xl border border-border p-4">
              <p className="stat-label">Hand over less</p>
              <p className="mt-1 text-2xl font-semibold text-heading num">
                {money(levers.max_payout_now)}
              </p>
              <p className="mt-1.5 text-sm text-text-light">
                a month, instead of {money(levers.ceiling)}. Nothing else changes.
              </p>
            </li>

            {/* A lever that cannot reach says so in words. A bare dash beside
                two large figures reads as a broken card rather than an
                answer. */}
            <li className="rounded-xl border border-border p-4">
              <p className="stat-label">Repay faster</p>
              {levers.needed_term ? (
                <>
                  <p className="mt-1 text-2xl font-semibold text-heading num">
                    {levers.needed_term} months
                  </p>
                  <p className="mt-1.5 text-sm text-text-light">
                    instead of {summary.repayment_term}. That puts the installment at{" "}
                    <span className="num">{money(levers.ceiling / levers.needed_term)}</span> a
                    month.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-lg font-semibold text-text-light">Not on its own</p>
                  <p className="mt-1.5 text-sm text-text-light">
                    Even repaying over the shortest sensible period does not close a gap this
                    size.
                  </p>
                </>
              )}
            </li>

            <li className="rounded-xl border border-border p-4">
              <p className="stat-label">Everyone puts in more</p>
              {levers.needed_contribution ? (
                <>
                  <p className="mt-1 text-2xl font-semibold text-heading num">
                    {money(levers.needed_contribution)}
                  </p>
                  <p className="mt-1.5 text-sm text-text-light">
                    a month each, instead of {money(summary.contribution_amount)} —{" "}
                    <span className="num">
                      {money(levers.needed_contribution - summary.contribution_amount)}
                    </span>{" "}
                    more per person.
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-lg font-semibold text-text-light">Not on its own</p>
                  <p className="mt-1.5 text-sm text-text-light">
                    Closing this gap by contributions alone would mean paying in more each month
                    than the withdrawal is worth.
                  </p>
                </>
              )}
            </li>
          </ul>

          <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface-alt px-4 py-3 text-base">
            <Icon name="info" className="mt-0.5 size-5 shrink-0 text-text-light" />
            <span>
              <span className="font-medium">And it is temporary.</span> Once every member is
              repaying more than one withdrawal at a time, the repayments coming in each month add
              up to the whole payout going out, and the account grows by the month&rsquo;s
              contributions —{" "}
              <span className="num font-medium">{money(levers.growth_after_ramp)}</span> — whatever
              the payout is. The squeeze is the {levers.trough_step || summary.months_to_trough}{" "}
              months to {monthName(summary.trough_month)}, not forever. Getting through it at a
              lower amount is enough; it can be raised again afterwards.
            </span>
          </p>
        </div>
      ) : null}
    </section>
  );
}
