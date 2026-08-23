import Link from "next/link";
import {
  getDashboard, getMemberPositions, getPayoutQueue, getSettings, getCycleEntries,
} from "@/app/_lib/data-service";
import { getSessionUser } from "@/app/_lib/helpers";
import { monthName, dayMonth } from "@/app/_lib/date-helpers";
import { money } from "@/app/_lib/format-helpers";
import PageHeader from "@/app/_components/ui/PageHeader";
import Icon from "@/app/_components/ui/Icon";
import Money from "@/app/_components/ui/Money";
import PayoutCard from "@/app/_components/committee/PayoutCard";
import ContributionButton from "@/app/_components/committee/ContributionButton";
import RepaymentDialog from "@/app/_components/committee/RepaymentDialog";
import CloseMonthButton from "@/app/_components/committee/CloseMonthButton";
import ReverseEntryButton from "@/app/_components/committee/ReverseEntryButton";
import EntryKind from "@/app/_components/committee/EntryKind";

export const metadata = { title: "This month" };

/**
 * The screen Arshad opens once a month and works down.
 *
 * Ordered the way the month actually happens: the ten contributions come in,
 * then repayments from whoever is still repaying, then one person is given the
 * committee. The layout follows that order rather than grouping by kind.
 */
export default async function MonthPage() {
  const user = await getSessionUser();
  const readOnly = user.role !== "manager";

  const [summary, settings] = await Promise.all([getDashboard(), getSettings()]);
  const [members, queue, entries] = await Promise.all([
    getMemberPositions(summary.cycle_no),
    getPayoutQueue(),
    getCycleEntries(summary.cycle_no),
  ]);

  const active = members.filter((m) => m.is_active);
  const unpaid = active.filter((m) => !m.paid_this_cycle);
  const owing = active.filter((m) => m.outstanding > 0);

  return (
    <>
      <PageHeader
        title={`${monthName(summary.period_month)}`}
        description={`Committee month ${summary.cycle_no}. ${
          unpaid.length === 0 ? "Everyone has paid." : `${unpaid.length} still to pay.`
        }`}
        actions={
          <>
            <Link href={`/print/month/${summary.cycle_no}`} className="btn" prefetch={false}>
              <Icon name="print" className="size-5" />
              Print summary
            </Link>
            {!readOnly ? (
              <CloseMonthButton
                cycleNo={summary.cycle_no}
                unpaidNames={unpaid.map((m) => m.full_name)}
                payoutDone={summary.payout_done}
              />
            ) : null}
          </>
        }
      />

      {/* ---- collection ------------------------------------------------- */}
      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg">Who has paid</h2>
            <p className="mt-1 text-base text-text-light">
              {money(summary.collected_this_cycle)} of {money(summary.expected_this_cycle)} in
              contributions, plus repayments from {owing.length}{" "}
              {owing.length === 1 ? "member" : "members"}.
            </p>
          </div>
          <p className="chip chip-quiet">
            <Icon name={unpaid.length ? "clock" : "check"} className="size-4" />
            {summary.paid_count} of {active.length} paid
          </p>
        </div>

        <div className="table-wrap">
          <table className="w-full">
            <thead className="border-b border-border bg-surface-alt">
              <tr>
                <th className="th">Member</th>
                <th className="th">Contribution</th>
                <th className="th-num">Owes in total</th>
                <th className="th-num">Installment due</th>
                <th className="th-num">Repaid this month</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {active.map((member) => (
                <tr key={member.id} className="border-b border-border last:border-0">
                  <td className="td">
                    <Link href={`/members/${member.id}`} className="font-medium text-primary hover:underline">
                      {member.full_name}
                    </Link>
                  </td>

                  <td className="td">
                    {member.paid_this_cycle ? (
                      <span className="chip chip-in">
                        <Icon name="check" className="size-4" />
                        paid {money(settings.contribution_amount)}
                      </span>
                    ) : readOnly ? (
                      <span className="chip chip-warn">
                        <Icon name="clock" className="size-4" />
                        not yet
                      </span>
                    ) : (
                      <ContributionButton
                        memberId={member.id}
                        cycleNo={summary.cycle_no}
                        memberName={member.full_name}
                      />
                    )}
                  </td>

                  <td className="td-num">
                    {member.outstanding > 0 ? (
                      <Money value={member.outstanding} bare tone="out" />
                    ) : (
                      <span className="text-text-light">—</span>
                    )}
                  </td>

                  <td className="td-num">
                    {member.installment_due > 0 ? (
                      <Money value={member.installment_due} bare />
                    ) : (
                      <span className="text-text-light">—</span>
                    )}
                  </td>

                  <td className="td-num">
                    {member.repaid_this_cycle > 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-in">
                        <Icon name="cash-in" className="size-4" />
                        <Money value={member.repaid_this_cycle} bare />
                      </span>
                    ) : (
                      <span className="text-text-light">—</span>
                    )}
                  </td>

                  <td className="td text-right">
                    {member.outstanding > 0 && !readOnly ? (
                      <RepaymentDialog member={member} cycleNo={summary.cycle_no} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---- the withdrawal --------------------------------------------- */}
      <section className="mt-6">
        {summary.payout_done ? (
          <div className="card flex flex-wrap items-center justify-between gap-4 p-6">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-out-soft text-out">
                <Icon name="cash-out" className="size-5" />
              </span>
              <div>
                <h2 className="text-lg">
                  This month&rsquo;s committee went to {summary.payout_member}
                </h2>
                <p className="mt-1 text-base text-text-light">
                  <Money value={summary.payout_amount} className="font-semibold" /> handed over.
                  Reverse it below if it was recorded against the wrong person.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <PayoutCard
            members={queue}
            cycleNo={summary.cycle_no}
            suggested={queue[0]}
            maxSafe={summary.max_safe}
            ceiling={summary.ceiling}
            term={settings.repayment_term_months}
            contribution={settings.contribution_amount}
            disabled={readOnly}
          />
        )}
      </section>

      {/* ---- what has been recorded ------------------------------------- */}
      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg">Everything recorded this month</h2>
          <p className="mt-1 text-base text-text-light">
            Newest first. Nothing here can be edited or deleted — a mistake is corrected by
            reversing it, and both entries stay on the record.
          </p>
        </div>

        {entries.length === 0 ? (
          <p className="px-6 py-10 text-center text-base text-text-light">
            Nothing recorded for this month yet.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="w-full">
              <thead className="border-b border-border bg-surface-alt">
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Member</th>
                  <th className="th">What</th>
                  <th className="th-num">Amount</th>
                  <th className="th" />
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
                        <EntryKind entry={entry} />
                      </td>
                      <td className={`td-num ${cancelled ? "text-text-light line-through" : ""}`}>
                        <Money value={entry.fund_delta} bare signed />
                      </td>
                      <td className="td text-right">
                        {!cancelled && !readOnly ? (
                          <ReverseEntryButton entry={entry} />
                        ) : null}
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
