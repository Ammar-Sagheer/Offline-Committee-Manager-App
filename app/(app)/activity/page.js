import Link from "next/link";
import { getActivity, getActivityActors } from "@/app/_lib/data-service";
import { dateTime, monthShort } from "@/app/_lib/date-helpers";
import PageHeader from "@/app/_components/ui/PageHeader";
import Money from "@/app/_components/ui/Money";
import EntryKind from "@/app/_components/committee/EntryKind";
import EmptyState from "@/app/_components/ui/EmptyState";

export const metadata = { title: "Activity" };

/**
 * Every ledger entry, in the order it was actually written -- not the order
 * of the month it belongs to. Written by the database itself and nobody,
 * including the manager, can edit a row after the fact; this screen is the
 * proof of that, not a claim about it.
 */
export default async function ActivityPage({ searchParams }) {
  const { by } = await searchParams;
  const userId = by || null;

  const [entries, actors] = await Promise.all([
    getActivity({ userId }),
    getActivityActors(),
  ]);

  return (
    <>
      <PageHeader
        title="Activity"
        description="Who entered, changed or removed what, and when. Written by the database itself, and nobody — including the manager — can edit it."
      />

      {actors.length > 1 ? (
        <div className="mb-6 flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1" role="tablist">
          <Link
            href="/activity"
            aria-selected={!userId}
            className={!userId ? "btn-primary px-3 py-1.5 text-sm" : "btn px-3 py-1.5 text-sm border-transparent"}
          >
            Everyone
          </Link>
          {actors.map((actor) => (
            <Link
              key={actor.id}
              href={`/activity?by=${actor.id}`}
              aria-selected={userId === actor.id}
              className={
                userId === actor.id
                  ? "btn-primary px-3 py-1.5 text-sm"
                  : "btn px-3 py-1.5 text-sm border-transparent"
              }
            >
              {actor.full_name}
            </Link>
          ))}
        </div>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState icon="activity" title="Nothing recorded yet">
          Every contribution, repayment and withdrawal will show up here, in the order it was
          actually entered.
        </EmptyState>
      ) : (
        <section className="card overflow-hidden">
          <div className="table-wrap">
            <table className="w-full">
              <thead className="border-b border-border bg-surface-alt">
                <tr>
                  <th className="th">When</th>
                  <th className="th">Who</th>
                  <th className="th">What</th>
                  <th className="th-num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const cancelled = entry.reversed_by_entry_id || entry.reverses_entry_id;
                  return (
                    <tr key={entry.id} className="border-b border-border last:border-0 align-top">
                      <td className="td whitespace-nowrap text-text-light">
                        {dateTime(entry.created_at)}
                      </td>
                      <td className="td whitespace-nowrap font-medium">
                        {entry.created_by_name ?? "—"}
                      </td>
                      <td className={`td ${cancelled ? "text-text-light line-through" : ""}`}>
                        <EntryKind entry={entry} />
                        <p className="mt-1 text-sm text-text-light">
                          <Link href={`/members/${entry.member_id}`} className="text-primary hover:underline">
                            {entry.full_name}
                          </Link>
                          {" · "}
                          {monthShort(entry.period_month)}
                        </p>
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
        </section>
      )}
    </>
  );
}
