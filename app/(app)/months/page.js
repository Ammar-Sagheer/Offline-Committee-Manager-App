import Link from "next/link";
import { getCycleHistory } from "@/app/_lib/data-service";
import { monthName } from "@/app/_lib/date-helpers";
import PageHeader from "@/app/_components/ui/PageHeader";
import Icon from "@/app/_components/ui/Icon";
import Money from "@/app/_components/ui/Money";

export const metadata = { title: "Past months" };

const PER_PAGE = 24;

/**
 * Every month the committee has run.
 *
 * Paged, because this list only ever grows -- thirteen rows today, a hundred
 * and thirty in ten years, and a hundred-and-thirty-row table is not a table,
 * it is a scroll. The page number lives in the query string so Back walks
 * through it and a page can be reloaded.
 */
export default async function MonthsPage({ searchParams }) {
  const params = await searchParams;
  const page = Math.max(1, Number(params?.page ?? 1) || 1);

  const all = await getCycleHistory();
  const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
  const rows = all.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <>
      <PageHeader
        title="Past months"
        description={`${all.length} committee months so far. The closing figure is what was in the account at the end of each one.`}
      />

      <section className="card overflow-hidden">
        <div className="table-wrap">
          <table className="w-full">
            <thead className="border-b border-border bg-surface-alt">
              <tr>
                <th className="th">Month</th>
                <th className="th-num">Paid in</th>
                <th className="th-num">Repayments</th>
                <th className="th-num">Handed over</th>
                <th className="th">Went to</th>
                <th className="th-num">Closing</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.cycle_no} className="border-b border-border last:border-0">
                  <td className="td whitespace-nowrap">
                    <Link href={`/months/${row.cycle_no}`} className="font-medium text-primary hover:underline">
                      {monthName(row.period_month)}
                    </Link>
                    <span className="ml-2 text-sm text-text-light">month {row.cycle_no}</span>
                    {row.status === "open" ? (
                      <span className="chip chip-in ml-2">
                        <Icon name="unlock" className="size-4" />
                        open
                      </span>
                    ) : null}
                  </td>
                  <td className="td-num">
                    <Money value={row.contributions} bare tone="in" />
                    <span className="ml-2 text-sm text-text-light">{row.contributors} paid</span>
                  </td>
                  <td className="td-num">
                    {row.repayments > 0 ? (
                      <Money value={row.repayments} bare tone="in" />
                    ) : (
                      <span className="text-text-light">—</span>
                    )}
                  </td>
                  <td className="td-num">
                    {row.payout > 0 ? (
                      <Money value={row.payout} bare tone="out" />
                    ) : (
                      <span className="text-text-light">—</span>
                    )}
                  </td>
                  <td className="td">{row.payout_member ?? <span className="text-text-light">nobody</span>}</td>
                  <td className="td-num font-semibold"><Money value={row.closing_balance} bare /></td>
                  <td className="td text-right">
                    <Link href={`/print/month/${row.cycle_no}`} className="btn-quiet px-2 py-1.5 text-sm"
                          prefetch={false}>
                      <Icon name="print" className="size-4" />
                      Print
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 ? (
          <nav className="flex items-center justify-between gap-3 border-t border-border px-6 py-3"
               aria-label="Pages">
            {/* A dead pager control is a span, never a link styled to look
                disabled -- a disabled-looking link still takes focus and still
                navigates. */}
            {page > 1 ? (
              <Link href={`/months?page=${page - 1}`} className="btn">Newer</Link>
            ) : (
              <span className="btn opacity-40">Newer</span>
            )}
            <span className="text-base text-text-light">Page {page} of {pages}</span>
            {page < pages ? (
              <Link href={`/months?page=${page + 1}`} className="btn">Older</Link>
            ) : (
              <span className="btn opacity-40">Older</span>
            )}
          </nav>
        ) : null}
      </section>
    </>
  );
}
