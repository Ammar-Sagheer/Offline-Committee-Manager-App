import {
  getSettings, getDashboard, getWhatIfProjection, getMaxSafePayout, getPayoutLevers,
} from "@/app/_lib/data-service";
import { monthName } from "@/app/_lib/date-helpers";
import { money } from "@/app/_lib/format-helpers";
import PageHeader from "@/app/_components/ui/PageHeader";
import Icon from "@/app/_components/ui/Icon";
import Money from "@/app/_components/ui/Money";
import ProjectionChart from "@/app/_components/committee/ProjectionChart";
import { MoneyInput } from "@/app/_components/ui/Field";

export const metadata = { title: "Projection" };

/**
 * The what-if screen.
 *
 * The controls are a plain GET form, so every scenario is a URL. That means the
 * back button walks through the ones already tried, a scenario can be reloaded
 * or written down, and none of it needs client state -- which matters because
 * the arithmetic behind it must stay in Postgres, where it is the same
 * arithmetic that refuses an unsafe payout.
 */
export default async function ProjectionPage({ searchParams }) {
  const params = await searchParams;
  const settings = await getSettings();

  const num = (key, fallback) => {
    const value = Number(String(params?.[key] ?? "").replace(/[,\s]/g, ""));
    return Number.isFinite(value) && value > 0 ? value : fallback;
  };

  const payout = num("payout", settings.max_payout_amount);
  const term = Math.round(num("term", settings.repayment_term_months));
  const contribution = num("contribution", settings.contribution_amount);
  const months = Math.min(Math.round(num("months", 36)), 240);

  const [summary, rows, safeRows, maxSafe, levers] = await Promise.all([
    getDashboard(),
    getWhatIfProjection({ months, payout, contribution, term }),
    getWhatIfProjection({ months, payout: await getMaxSafePayout(months) }),
    getMaxSafePayout(months),
    getPayoutLevers(),
  ]);

  const lowest = rows.reduce((low, row) => (row.closing < low.closing ? row : low), rows[0]);
  const safe = lowest.closing >= settings.safety_buffer;
  const changed =
    term !== settings.repayment_term_months || contribution !== settings.contribution_amount;

  return (
    <>
      <PageHeader
        title="What happens next"
        description="Change any of these and the whole projection is recalculated by the database — the same arithmetic that decides whether a withdrawal is allowed."
      />

      {/* Controls in one row above the chart, and every one of them a URL. */}
      <form method="get" className="card mb-6 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="payout" className="label">Handed over each month</label>
            <MoneyInput id="payout" name="payout" defaultValue={Math.round(payout)} />
          </div>
          <div>
            <label htmlFor="contribution" className="label">Contribution, each person</label>
            <MoneyInput id="contribution" name="contribution" defaultValue={Math.round(contribution)} />
          </div>
          <div>
            <label htmlFor="term" className="label">Repaid over (months)</label>
            <input id="term" name="term" type="number" min="1" max="120"
                   defaultValue={term} className="input" />
          </div>
          <div>
            <label htmlFor="months" className="label">Look ahead (months)</label>
            <input id="months" name="months" type="number" min="6" max="240" step="6"
                   defaultValue={months} className="input" />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="submit" className="btn-primary">Work it out</button>
          <a href="/projection" className="btn">Back to the agreed terms</a>
          <a href={`/projection?payout=${Math.round(maxSafe)}`} className="btn">
            Try the safe amount · <span className="num">{money(maxSafe)}</span>
          </a>
          {levers.needed_term ? (
            <a href={`/projection?payout=${Math.round(settings.max_payout_amount)}&term=${levers.needed_term}`}
               className="btn">
              Try {levers.needed_term}-month repayment
            </a>
          ) : null}
        </div>
      </form>

      <section
        className={`card mb-6 flex items-start gap-3 p-5 ${safe ? "bg-in-soft" : "bg-danger-soft"}`}
      >
        <Icon name={safe ? "check" : "warning"}
              className={`mt-0.5 size-6 shrink-0 ${safe ? "text-in" : "text-danger"}`} />
        <div>
          <h2 className="text-lg">
            {safe ? "These terms hold" : "These terms break the committee"}
          </h2>
          <p className="mt-1 text-base">
            Handing over <span className="num font-semibold">{money(payout)}</span> a month
            {changed ? (
              <>
                , with everyone contributing <span className="num">{money(contribution)}</span> and
                withdrawals repaid over {term} months,
              </>
            ) : null}{" "}
            takes the account to a low of{" "}
            <span className={`num font-semibold ${safe ? "" : "text-danger"}`}>
              {money(lowest.closing)}
            </span>{" "}
            in {monthName(lowest.period_month)} — {safe ? "above" : "below"} the{" "}
            <span className="num">{money(settings.safety_buffer)}</span> cushion.
          </p>
          {!safe ? (
            <p className="mt-2 text-base">
              On the terms actually agreed, the most it can afford is{" "}
              <span className="num font-semibold">{money(maxSafe)}</span> a month.
            </p>
          ) : null}
        </div>
      </section>

      <section className="card p-6">
        <ProjectionChart
          rows={rows}
          safeRows={safeRows}
          buffer={settings.safety_buffer}
          proposedLabel={`At ${money(payout)}${changed ? " on these terms" : ""}`}
          safeLabel={`At ${money(maxSafe)} on the agreed terms`}
          height={360}
        />
      </section>

      {/* The same figures as a table -- the chart is never the only way to read
          them, and this is the version that gets checked against a bank slip. */}
      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg">Month by month</h2>
          <p className="mt-1 text-base text-text-light">
            Month {summary.cycle_no} onwards. The first row counts only what is still to come in
            this month — what has already been recorded is in the opening figure.
          </p>
        </div>
        <div className="table-wrap">
          <table className="w-full">
            <thead className="border-b border-border bg-surface-alt">
              <tr>
                <th className="th">Month</th>
                <th className="th-num">Opening</th>
                <th className="th-num">Contributions</th>
                <th className="th-num">Repayments</th>
                <th className="th-num">Handed over</th>
                <th className="th-num">Closing</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const low = row.closing < settings.safety_buffer;
                return (
                  <tr
                    key={row.step}
                    className={`border-b border-border last:border-0 ${low ? "bg-danger-soft" : ""}`}
                  >
                    <td className="td whitespace-nowrap">
                      {monthName(row.period_month)}
                      <span className="ml-2 text-sm text-text-light">month {row.cycle_no}</span>
                    </td>
                    <td className="td-num text-text-light"><Money value={row.opening} bare /></td>
                    <td className="td-num text-in"><Money value={row.contributions} bare /></td>
                    <td className="td-num text-in"><Money value={row.repayments} bare /></td>
                    <td className="td-num text-out"><Money value={row.payout} bare /></td>
                    <td className={`td-num font-semibold ${low ? "text-danger" : ""}`}>
                      <span className="inline-flex items-center gap-1.5">
                        {low ? <Icon name="warning" className="size-4" /> : null}
                        <Money value={row.closing} bare />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
