import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getMember, getMemberPosition, getMemberStatement, getMemberLoans, getSettings,
} from "@/app/_lib/data-service";
import { getSessionUser } from "@/app/_lib/helpers";
import { monthName, dayMonth } from "@/app/_lib/date-helpers";
import { money } from "@/app/_lib/format-helpers";
import PageHeader from "@/app/_components/ui/PageHeader";
import StatCard from "@/app/_components/ui/StatCard";
import Icon from "@/app/_components/ui/Icon";
import Money from "@/app/_components/ui/Money";
import RepaymentDialog from "@/app/_components/committee/RepaymentDialog";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const member = await getMember(id);
  return { title: member?.full_name ?? "Member" };
}

export default async function MemberPage({ params }) {
  const { id } = await params;
  const user = await getSessionUser();
  const readOnly = user.role !== "manager";

  const member = await getMember(id);
  if (!member) notFound();

  const [position, statement, loans, settings] = await Promise.all([
    getMemberPosition(id),
    getMemberStatement(id),
    getMemberLoans(id),
    getSettings(),
  ]);

  const activeLoans = loans.filter((l) => l.status === "active" && l.outstanding > 0);

  return (
    <>
      <PageHeader
        title={member.full_name}
        description={
          <>
            Joined {monthName(member.joined_on)}. {position.months_paid} months paid,{" "}
            {position.turns_taken === 0
              ? "has never taken the committee."
              : `${position.turns_taken} ${position.turns_taken === 1 ? "turn" : "turns"} taken.`}
          </>
        }
        actions={
          <>
            <Link href={`/print/statement/${id}`} className="btn" prefetch={false}>
              <Icon name="print" className="size-5" />
              Print statement
            </Link>
            {position.outstanding > 0 && !readOnly ? (
              <RepaymentDialog member={position} cycleNo={null} />
            ) : null}
          </>
        }
      />

      <section className="@container">
        <div className="grid gap-4 @[34rem]:grid-cols-2 @[64rem]:grid-cols-4">
        <StatCard label="Put in altogether" value={money(position.contributed)} icon="cash-in" tone="in" />
        <StatCard
          label="Taken out"
          value={money(position.withdrawn)}
          icon="cash-out"
          tone={position.withdrawn > 0 ? "out" : "neutral"}
          sub={position.turns_taken ? `over ${position.turns_taken} turns` : "never taken a turn"}
        />
        <StatCard
          label="Still owes"
          value={money(position.outstanding)}
          icon={position.outstanding > 0 ? "clock" : "check"}
          tone={position.outstanding > 0 ? "out" : "in"}
          sub={
            position.outstanding > 0
              ? `${money(position.installment_due, { paisa: true })} due each month`
              : "nothing outstanding"
          }
        />
        <StatCard
          label="His stake in the fund"
          value={money(position.equity)}
          icon="dashboard"
          sub="What he has put in, less what he still owes"
        />
        </div>
      </section>

      {activeLoans.length > 0 ? (
        <section className="card mt-6 overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg">
              {activeLoans.length === 1 ? "The committee he is repaying" : "The committees he is repaying"}
            </h2>
            <p className="mt-1 text-base text-text-light">
              Paying more than the installment does not lower it — the committee just finishes
              earlier.
            </p>
          </div>
          <div className="table-wrap">
            <table className="w-full">
              <thead className="border-b border-border bg-surface-alt">
                <tr>
                  <th className="th">Taken in</th>
                  <th className="th-num">Amount</th>
                  <th className="th-num">Repaid</th>
                  <th className="th-num">Still owes</th>
                  <th className="th-num">Monthly</th>
                  <th className="th-num">Months left</th>
                </tr>
              </thead>
              <tbody>
                {activeLoans.map((loan) => (
                  <tr key={loan.id} className="border-b border-border last:border-0">
                    <td className="td">
                      {monthName(loan.period_month)}
                      <span className="ml-2 text-sm text-text-light">month {loan.cycle_no}</span>
                    </td>
                    <td className="td-num"><Money value={loan.principal} bare /></td>
                    <td className="td-num"><Money value={loan.repaid} bare tone="in" /></td>
                    <td className="td-num"><Money value={loan.outstanding} bare tone="out" /></td>
                    <td className="td-num"><Money value={loan.installment} bare paisa /></td>
                    <td className="td-num">
                      {loan.months_remaining}
                      {loan.months_remaining < loan.term_months ? (
                        <span className="ml-2 text-sm text-in">
                          {loan.term_months - loan.months_remaining} ahead
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg">Every entry, newest first</h2>
          <p className="mt-1 text-base text-text-light">
            {statement.length} entries. The running figure is his stake in the fund after each one.
          </p>
        </div>

        <div className="table-wrap">
          <table className="w-full">
            <thead className="border-b border-border bg-surface-alt">
              <tr>
                <th className="th">Month</th>
                <th className="th">Date</th>
                <th className="th">What</th>
                <th className="th-num">Amount</th>
                <th className="th-num">Stake after</th>
              </tr>
            </thead>
            <tbody>
              {statement.map((row) => {
                const cancelled = row.is_reversed || row.is_reversal;
                return (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="td whitespace-nowrap text-text-light">
                      {monthName(row.period_month)}
                    </td>
                    <td className="td whitespace-nowrap text-text-light">{dayMonth(row.entry_date)}</td>
                    <td className={`td ${cancelled ? "text-text-light line-through" : ""}`}>
                      <span className="flex flex-wrap items-center gap-2">
                        {row.entry_type === "contribution" ? "Contribution"
                          : row.entry_type === "repayment" ? "Repayment"
                          : row.entry_type === "payout" ? "Took the committee"
                          : "Adjustment"}
                        {row.is_reversal ? <span className="chip chip-quiet">reversal</span> : null}
                        {row.is_reversed ? <span className="chip chip-quiet">reversed</span> : null}
                        {row.override_reason ? (
                          <span className="chip chip-bad">
                            <Icon name="warning" className="size-4" />
                            overridden
                          </span>
                        ) : null}
                      </span>
                      {row.note ? (
                        <span className="mt-0.5 block text-sm text-text-light">{row.note}</span>
                      ) : null}
                      {row.override_reason ? (
                        <span className="mt-0.5 block text-sm text-danger">{row.override_reason}</span>
                      ) : null}
                    </td>
                    <td className={`td-num ${cancelled ? "text-text-light line-through" : ""}`}>
                      <span className={row.fund_delta < 0 ? "text-out" : "text-in"}>
                        <Money value={row.fund_delta} bare signed />
                      </span>
                    </td>
                    <td className="td-num text-text-light">
                      <Money value={row.running_equity} bare />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-4 text-sm text-text-light">
        Contribution set at {money(settings.contribution_amount)} a month. Withdrawals are repaid
        over {settings.repayment_term_months} months.
      </p>
    </>
  );
}
