import Link from "next/link";
import { notFound } from "next/navigation";
import { getCycle, getCycleEntries, getMemberPositions } from "@/app/_lib/data-service";
import { getSessionUser } from "@/app/_lib/helpers";
import { monthName, dayMonth } from "@/app/_lib/date-helpers";
import PageHeader from "@/app/_components/ui/PageHeader";
import Icon from "@/app/_components/ui/Icon";
import Money from "@/app/_components/ui/Money";
import StatCard from "@/app/_components/ui/StatCard";
import { money } from "@/app/_lib/format-helpers";
import ReopenMonthButton from "@/app/_components/committee/ReopenMonthButton";

export async function generateMetadata({ params }) {
  const { cycleNo } = await params;
  const cycle = await getCycle(Number(cycleNo));
  return { title: cycle ? monthName(cycle.period_month) : "Month" };
}

export default async function CyclePage({ params }) {
  const { cycleNo } = await params;
  const n = Number(cycleNo);
  if (!Number.isInteger(n)) notFound();

  const user = await getSessionUser();
  const readOnly = user.role !== "manager";

  const cycle = await getCycle(n);
  if (!cycle) notFound();

  const [entries, members] = await Promise.all([getCycleEntries(n), getMemberPositions(n)]);
  const active = members.filter((m) => m.is_active);
  const missed = active.filter((m) => !m.paid_this_cycle);

  return (
    <>
      <PageHeader
        title={monthName(cycle.period_month)}
        description={`Committee month ${cycle.cycle_no}. ${cycle.status === "closed" ? "Closed — nothing can be posted into it." : "Open."}`}
        actions={
          <>
            <Link href={`/print/month/${n}`} className="btn" prefetch={false}>
              <Icon name="print" className="size-5" />
              Print
            </Link>
            {cycle.status === "closed" && !readOnly ? <ReopenMonthButton cycleNo={n} /> : null}
          </>
        }
      />

      <section className="@container">
        <div className="grid gap-4 @[34rem]:grid-cols-2 @[64rem]:grid-cols-4">
        <StatCard label="Paid in" value={money(cycle.contributions)} icon="cash-in" tone="in"
                  sub={`${cycle.contributors} of ${active.length} members`} />
        <StatCard label="Repayments" value={money(cycle.repayments)} icon="cash-in" tone="in" />
        <StatCard label="Handed over" value={money(cycle.payout)} icon="cash-out"
                  tone={cycle.payout > 0 ? "out" : "neutral"}
                  sub={cycle.payout_member ? `to ${cycle.payout_member}` : "nobody took it"} />
        <StatCard label="In the account at the end" value={money(cycle.closing_balance)}
                  icon="dashboard" />
        </div>
      </section>

      {cycle.override_reason ? (
        <p className="card mt-6 flex items-start gap-3 bg-danger-soft p-5 text-base text-danger">
          <Icon name="warning" className="mt-0.5 size-6 shrink-0" />
          <span>
            <span className="font-semibold">This month&rsquo;s withdrawal was recorded over a
            refusal.</span>{" "}
            The reason given was: &ldquo;{cycle.override_reason}&rdquo;
          </span>
        </p>
      ) : null}

      {missed.length > 0 ? (
        <p className="card mt-6 flex items-start gap-3 bg-warning-soft p-5 text-base text-warning">
          <Icon name="clock" className="mt-0.5 size-6 shrink-0" />
          <span>
            {missed.length === 1
              ? `${missed[0].full_name} did not pay in this month.`
              : `${missed.length} members did not pay in this month: ${missed.map((m) => m.full_name).join(", ")}.`}
          </span>
        </p>
      ) : null}

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg">Everything recorded</h2>
        </div>
        {entries.length === 0 ? (
          <p className="px-6 py-10 text-center text-base text-text-light">Nothing was recorded.</p>
        ) : (
          <div className="table-wrap">
            <table className="w-full">
              <thead className="border-b border-border bg-surface-alt">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Member</th>
                  <th className="th">What</th>
                  <th className="th-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const cancelled = entry.reversed_by_entry_id || entry.reverses_entry_id;
                  return (
                    <tr key={entry.id} className="border-b border-border last:border-0">
                      <td className="td whitespace-nowrap text-text-light">{dayMonth(entry.entry_date)}</td>
                      <td className={`td ${cancelled ? "text-text-light line-through" : ""}`}>
                        {entry.full_name}
                      </td>
                      <td className="td">
                        {entry.entry_type === "contribution" ? "Contribution"
                          : entry.entry_type === "repayment" ? "Repayment"
                          : entry.entry_type === "payout" ? "Took the committee"
                          : "Adjustment"}
                        {cancelled ? <span className="chip chip-quiet ml-2">cancelled</span> : null}
                        {entry.note ? (
                          <span className="mt-0.5 block text-sm text-text-light">{entry.note}</span>
                        ) : null}
                      </td>
                      <td className={`td-num ${cancelled ? "text-text-light line-through" : ""}`}>
                        <Money value={entry.fund_delta} bare signed />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
