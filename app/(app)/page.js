import Link from "next/link";
import {
  getDashboard, getPayoutQueue, getProjection, getMaxSafePayout,
} from "@/app/_lib/data-service";
import { monthName } from "@/app/_lib/date-helpers";
import { money } from "@/app/_lib/format-helpers";
import PageHeader from "@/app/_components/ui/PageHeader";
import StatCard from "@/app/_components/ui/StatCard";
import Icon from "@/app/_components/ui/Icon";
import Money from "@/app/_components/ui/Money";
import ProjectionChart from "@/app/_components/committee/ProjectionChart";
import SafePayoutPanel from "@/app/_components/committee/SafePayoutPanel";

export default async function DashboardPage() {
  const summary = await getDashboard();
  const maxSafe = summary.max_safe;

  // Independent queries, so they go together. In sequence they would double the
  // time before anything appears, for no reason at all.
  const [queue, atCeiling, atSafe] = await Promise.all([
    getPayoutQueue(),
    getProjection({ months: 36, payout: summary.ceiling }),
    getProjection({ months: 36, payout: maxSafe }),
  ]);

  const collectedShort = summary.expected_this_cycle - summary.collected_this_cycle;
  const stillToPay = summary.member_count - summary.paid_count;

  return (
    <>
      <PageHeader
        title={`${monthName(summary.period_month)} — committee month ${summary.cycle_no}`}
        description={
          summary.payout_done
            ? `This month's committee has gone to ${summary.payout_member}.`
            : "This month's committee has not been given out yet."
        }
        actions={
          <Link href="/month" className="btn-primary">
            <Icon name="month" className="size-5" />
            This month&rsquo;s work
          </Link>
        }
      />

      <section className="@container">
        <div className="grid gap-4 @[34rem]:grid-cols-2 @[64rem]:grid-cols-4">
        <StatCard
          label="In the committee account"
          value={money(summary.balance)}
          icon="cash-in"
          sub={`Everyone's stake adds up to exactly this`}
        />
        <StatCard
          label="Collected this month"
          value={`${summary.paid_count} of ${summary.member_count}`}
          icon={stillToPay ? "clock" : "check"}
          tone={stillToPay ? "warn" : "in"}
          sub={
            stillToPay
              ? `${money(collectedShort)} still to come in`
              : "Everybody has paid"
          }
        />
        <StatCard
          label="Owed back to the committee"
          value={money(summary.total_outstanding)}
          icon="cash-out"
          tone={summary.total_outstanding > 0 ? "out" : "neutral"}
          sub="Across every withdrawal still being repaid"
        />
        <StatCard
          label="Safe to hand over, monthly"
          value={money(maxSafe)}
          icon={maxSafe >= summary.ceiling ? "check" : "warning"}
          tone={maxSafe >= summary.ceiling ? "in" : "warn"}
          sub={
            maxSafe >= summary.ceiling
              ? `The agreed ${money(summary.ceiling)} is within this`
              : `${money(summary.ceiling - maxSafe)} below the agreed ${money(summary.ceiling)}`
          }
        />
        </div>
      </section>

      <SafePayoutPanel summary={summary} className="mt-6" />

      <section className="card mt-6 p-6">
        <div className="mb-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg">The next three years</h2>
            <p className="mt-1 text-base text-text-light">
              What the account does if the same amount goes out every month from here.
            </p>
          </div>
          <Link href="/projection" className="btn-quiet no-print">
            Try other amounts
            <Icon name="chevron" className="size-4" />
          </Link>
        </div>

        <ProjectionChart
          rows={atCeiling}
          safeRows={atSafe}
          buffer={summary.safety_buffer}
          proposedLabel={`At the agreed ${money(summary.ceiling)}`}
          safeLabel={`At ${money(maxSafe)}`}
        />
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg">Whose turn it should be</h2>
          <p className="mt-1 text-base text-text-light">
            Never taken it first, then longest since their last turn. A suggestion only —
            the committee decides this among themselves.
          </p>
        </div>

        <div className="table-wrap">
          <table className="w-full">
            <thead className="border-b border-border bg-surface-alt">
              <tr>
                <th className="th w-12">#</th>
                <th className="th">Member</th>
                <th className="th">Last turn</th>
                <th className="th-num">Still owes</th>
                <th className="th-num">His stake</th>
              </tr>
            </thead>
            <tbody>
              {queue.slice(0, 6).map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="td num text-text-light">{row.queue_position}</td>
                  <td className="td">
                    <Link href={`/members/${row.id}`} className="font-medium text-primary hover:underline">
                      {row.full_name}
                    </Link>
                    {row.turns_taken === 0 ? (
                      <span className="mt-1 flex">
                        <span className="chip chip-in">
                          <Icon name="trophy" className="size-4" />
                          never taken it
                        </span>
                      </span>
                    ) : null}
                  </td>
                  <td className="td text-text-light">
                    {row.last_payout_cycle
                      ? `Month ${row.last_payout_cycle}, ${row.months_since} months ago`
                      : "—"}
                  </td>
                  <td className="td-num">
                    {row.outstanding > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-out">
                        <Icon name="cash-out" className="size-4" />
                        <Money value={row.outstanding} bare />
                      </span>
                    ) : (
                      <span className="text-text-light">nothing</span>
                    )}
                  </td>
                  <td className="td-num"><Money value={row.equity} bare /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="border-t border-border px-6 py-3">
          <Link href="/members" className="btn-quiet -ml-3">
            All {queue.length} members
            <Icon name="chevron" className="size-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
