import { notFound } from "next/navigation";
import { getCycle, getMemberPositions, getDashboard, getSettings } from "@/app/_lib/data-service";
import { monthName, dayMonth, today } from "@/app/_lib/date-helpers";
import { money } from "@/app/_lib/format-helpers";
import { siteConfig } from "@/app/_lib/siteConfig";
import Money from "@/app/_components/ui/Money";

export async function generateMetadata({ params }) {
  const { cycleNo } = await params;
  const cycle = await getCycle(Number(cycleNo));
  return { title: `Month summary — ${cycle ? monthName(cycle.period_month) : cycleNo}` };
}

/**
 * One month on one sheet, for passing round the committee.
 *
 * An override is reprinted here in full. That is the point of writing one down:
 * a decision the other nine can see, rather than a figure that quietly differs
 * from what was agreed.
 */
export default async function MonthPrintPage({ params }) {
  const { cycleNo } = await params;
  const n = Number(cycleNo);
  if (!Number.isInteger(n)) notFound();

  const cycle = await getCycle(n);
  if (!cycle) notFound();

  const [members, summary, settings] = await Promise.all([
    getMemberPositions(n), getDashboard(), getSettings(),
  ]);
  const active = members.filter((m) => m.is_active);

  return (
    <article>
      <header className="mb-6 border-b-2 border-[#333] pb-4">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl">{monthName(cycle.period_month)}</h1>
            <p className="mt-1 text-base text-text-light">
              Committee month {cycle.cycle_no} — {siteConfig.committeeName}
            </p>
          </div>
          <div className="shrink-0 whitespace-nowrap text-right text-sm text-text-light">
            <p>Printed {dayMonth(today())}</p>
            <p>{cycle.status === "closed" ? "Closed" : "Still open"}</p>
          </div>
        </div>
      </header>

      <section className="mb-6 grid grid-cols-4 gap-4">
        {[
          ["Paid in", money(cycle.contributions), `${cycle.contributors} of ${active.length} members`],
          ["Repayments", money(cycle.repayments), "against past withdrawals"],
          ["Handed over", money(cycle.payout), cycle.payout_member ? `to ${cycle.payout_member}` : "nobody"],
          ["In the account at the end", money(cycle.closing_balance), "after everything above"],
        ].map(([label, value, sub]) => (
          <div key={label} className="border border-[#ccc] p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-light">{label}</p>
            <p className="num mt-1 text-lg font-semibold">{value}</p>
            <p className="mt-0.5 text-xs text-text-light">{sub}</p>
          </div>
        ))}
      </section>

      {cycle.override_reason ? (
        <section className="mb-6 border-2 border-[#b91c1c] p-4">
          <h2 className="text-base font-semibold text-danger">
            This month&rsquo;s withdrawal was recorded over the app&rsquo;s refusal
          </h2>
          <p className="mt-1 text-sm">
            The app calculated that this amount would run the committee account below its agreed
            cushion. It was recorded anyway, and the reason given was:
          </p>
          <p className="mt-2 border-l-4 border-[#b91c1c] pl-3 text-base italic">
            &ldquo;{cycle.override_reason}&rdquo;
          </p>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-lg">Where every member stands</h2>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-[#999]">
              <th className="th">Member</th>
              <th className="th">This month</th>
              <th className="th-num">Repaid this month</th>
              <th className="th-num">Put in altogether</th>
              <th className="th-num">Still owes</th>
              <th className="th-num">His stake</th>
            </tr>
          </thead>
          <tbody>
            {active.map((member) => (
              <tr key={member.id} className="border-b border-[#ddd]">
                <td className="td">{member.full_name}</td>
                <td className="td">{member.paid_this_cycle ? "paid" : "not paid"}</td>
                <td className="td-num">
                  {member.repaid_this_cycle > 0 ? <Money value={member.repaid_this_cycle} bare /> : "—"}
                </td>
                <td className="td-num"><Money value={member.contributed} bare /></td>
                <td className="td-num">
                  {member.outstanding > 0 ? <Money value={member.outstanding} bare /> : "—"}
                </td>
                <td className="td-num"><Money value={member.equity} bare /></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[#333] font-semibold">
              <td className="td">All {active.length} members</td>
              <td className="td">{cycle.contributors} paid</td>
              <td className="td-num"><Money value={cycle.repayments} bare /></td>
              <td className="td-num">
                <Money value={active.reduce((t, m) => t + m.contributed, 0)} bare />
              </td>
              <td className="td-num">
                <Money value={active.reduce((t, m) => t + m.outstanding, 0)} bare />
              </td>
              <td className="td-num">
                <Money value={active.reduce((t, m) => t + m.equity, 0)} bare />
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      <footer className="mt-8 border-t border-[#999] pt-3 text-xs text-text-light">
        <p>
          Contribution {money(settings.contribution_amount)} a month each. Withdrawals repaid over{" "}
          {settings.repayment_term_months} months. Every member&rsquo;s stake adds up to exactly what
          is in the account — <span className="num">{money(summary.balance)}</span> as things stand
          today.
        </p>
        <p className="mt-1">{siteConfig.printFooter}</p>
      </footer>
    </article>
  );
}
