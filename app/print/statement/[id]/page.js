import { notFound } from "next/navigation";
import {
  getMember, getMemberPosition, getMemberStatement, getMemberLoans, getSettings, getDashboard,
} from "@/app/_lib/data-service";
import { monthName, dayMonth, today } from "@/app/_lib/date-helpers";
import { money } from "@/app/_lib/format-helpers";
import { siteConfig } from "@/app/_lib/siteConfig";
import Money from "@/app/_components/ui/Money";

export async function generateMetadata({ params }) {
  const { id } = await params;
  const member = await getMember(id);
  return { title: `Statement — ${member?.full_name ?? "member"}` };
}

/** One member's whole position on one sheet, for handing to that member. */
export default async function StatementPage({ params }) {
  const { id } = await params;
  const member = await getMember(id);
  if (!member) notFound();

  const [position, statement, loans, settings, summary] = await Promise.all([
    getMemberPosition(id), getMemberStatement(id), getMemberLoans(id),
    getSettings(), getDashboard(),
  ]);

  const active = loans.filter((l) => l.status === "active" && l.outstanding > 0);
  const rows = [...statement].reverse(); // oldest first reads like a passbook

  return (
    <article>
      <header className="mb-6 border-b-2 border-[#333] pb-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl">{member.full_name}</h1>
            <p className="mt-1 text-base text-text-light">
              Committee statement — {siteConfig.committeeName}
            </p>
          </div>
          <div className="shrink-0 whitespace-nowrap text-right text-sm text-text-light">
            <p>Printed {dayMonth(today())}</p>
            <p>Up to committee month {summary.cycle_no}</p>
            <p>{monthName(summary.period_month)}</p>
          </div>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-4 gap-4">
        {[
          ["Put in altogether", money(position.contributed), `${position.months_paid} months`],
          ["Taken out", money(position.withdrawn),
            position.turns_taken ? `${position.turns_taken} turns` : "never taken a turn"],
          ["Still owes", money(position.outstanding),
            position.outstanding > 0
              ? `${money(position.installment_due)} a month`
              : "nothing"],
          ["His stake in the fund", money(position.equity), "put in, less what is owed"],
        ].map(([label, value, sub]) => (
          <div key={label} className="border border-[#ccc] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-light">{label}</p>
            <p className="num mt-1 text-lg font-semibold">{value}</p>
            <p className="mt-0.5 text-xs text-text-light">{sub}</p>
          </div>
        ))}
      </section>

      {active.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-2 text-lg">Being repaid</h2>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-y border-[#999]">
                <th className="th">Taken in</th>
                <th className="th-num">Amount</th>
                <th className="th-num">Repaid</th>
                <th className="th-num">Still owes</th>
                <th className="th-num">Each month</th>
                <th className="th-num">Months left</th>
              </tr>
            </thead>
            <tbody>
              {active.map((loan) => (
                <tr key={loan.id} className="border-b border-[#ddd]">
                  <td className="td">{monthName(loan.period_month)}</td>
                  <td className="td-num"><Money value={loan.principal} bare /></td>
                  <td className="td-num"><Money value={loan.repaid} bare /></td>
                  <td className="td-num"><Money value={loan.outstanding} bare /></td>
                  <td className="td-num"><Money value={loan.installment} bare /></td>
                  <td className="td-num">{loan.months_remaining}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-sm text-text-light">
            Paying more than the monthly figure does not lower it — the committee simply finishes
            sooner.
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-lg">Every entry</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-[#999]">
              <th className="th">Month</th>
              <th className="th">Date</th>
              <th className="th">What</th>
              <th className="th-num">In</th>
              <th className="th-num">Out</th>
              <th className="th-num">Stake after</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const cancelled = row.is_reversed || row.is_reversal;
              return (
                <tr key={row.id} className={`border-b border-[#ddd] ${cancelled ? "text-text-light" : ""}`}>
                  <td className="td whitespace-nowrap">{monthName(row.period_month)}</td>
                  <td className="td whitespace-nowrap">{dayMonth(row.entry_date)}</td>
                  <td className="td">
                    {row.entry_type === "contribution" ? "Contribution"
                      : row.entry_type === "repayment" ? "Repayment"
                      : row.entry_type === "payout" ? "Took the committee"
                      : "Adjustment"}
                    {row.is_reversal ? " (correction)" : ""}
                    {row.is_reversed ? " (cancelled)" : ""}
                  </td>
                  <td className="td-num">
                    {row.fund_delta > 0 ? <Money value={row.fund_delta} bare /> : ""}
                  </td>
                  <td className="td-num">
                    {row.fund_delta < 0 ? <Money value={-row.fund_delta} bare /> : ""}
                  </td>
                  <td className="td-num"><Money value={row.running_equity} bare /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <footer className="mt-8 border-t border-[#999] pt-3 text-xs text-text-light">
        <p>
          Contribution {money(settings.contribution_amount)} a month. Withdrawals repaid over{" "}
          {settings.repayment_term_months} months. The committee account held{" "}
          <span className="num">{money(summary.balance)}</span> when this was printed, and every
          member&rsquo;s stake adds up to exactly that.
        </p>
        <p className="mt-1">{siteConfig.printFooter}</p>
      </footer>
    </article>
  );
}
