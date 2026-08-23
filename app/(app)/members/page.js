import Link from "next/link";
import { getMemberPositions, getDashboard } from "@/app/_lib/data-service";
import { getSessionUser } from "@/app/_lib/helpers";
import { money } from "@/app/_lib/format-helpers";
import PageHeader from "@/app/_components/ui/PageHeader";
import Icon from "@/app/_components/ui/Icon";
import Avatar from "@/app/_components/ui/Avatar";
import Money from "@/app/_components/ui/Money";
import EmptyState from "@/app/_components/ui/EmptyState";
import AddMemberButton from "@/app/_components/committee/AddMemberButton";

export const metadata = { title: "Members" };

export default async function MembersPage() {
  const user = await getSessionUser();
  const readOnly = user.role !== "manager";

  const [members, summary] = await Promise.all([getMemberPositions(), getDashboard()]);
  const active = members.filter((m) => m.is_active);
  const past = members.filter((m) => !m.is_active);

  return (
    <>
      <PageHeader
        title="Members"
        description={
          <>
            Everyone&rsquo;s stake adds up to exactly what is in the account —{" "}
            <span className="num font-medium">{money(summary.balance)}</span>. A member&rsquo;s
            stake is what he has put in, less what he still owes.
          </>
        }
        actions={!readOnly ? <AddMemberButton /> : null}
      />

      <section className="card overflow-hidden">
        <div className="table-wrap">
          <table className="w-full">
            <thead className="border-b border-border bg-surface-alt">
              <tr>
                <th className="th">Member</th>
                <th className="th-num">Months paid</th>
                <th className="th-num">Put in</th>
                <th className="th-num">Taken out</th>
                <th className="th-num">Still owes</th>
                <th className="th-num">His stake</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {active.map((member) => (
                <tr key={member.id} className="border-b border-border last:border-0">
                  <td className="td">
                    <div className="flex items-start gap-3">
                      <Avatar name={member.full_name} className="mt-0.5 size-9" />
                      <div>
                        <Link href={`/members/${member.id}`} className="font-medium text-primary hover:underline">
                          {member.full_name}
                        </Link>
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          {member.turns_taken === 0 ? (
                            <span className="chip chip-quiet">never taken it</span>
                          ) : (
                            <span className="chip chip-quiet">
                              {member.turns_taken} {member.turns_taken === 1 ? "turn" : "turns"}
                            </span>
                          )}
                          {!member.paid_this_cycle ? (
                            <span className="chip chip-warn">
                              <Icon name="clock" className="size-4" />
                              owes this month
                            </span>
                          ) : null}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="td-num text-text-light">{member.months_paid}</td>
                  <td className="td-num">
                    <Money value={member.contributed} bare tone="in" />
                  </td>
                  <td className="td-num">
                    {member.withdrawn > 0 ? (
                      <Money value={member.withdrawn} bare tone="out" />
                    ) : (
                      <span className="text-text-light">—</span>
                    )}
                  </td>
                  <td className="td-num">
                    {member.outstanding > 0 ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Icon name="cash-out" className="size-4 text-out" />
                        <Money value={member.outstanding} bare tone="out" />
                      </span>
                    ) : (
                      <span className="text-text-light">nothing</span>
                    )}
                  </td>
                  <td className="td-num font-semibold">
                    {member.equity < 0 ? (
                      <span className="inline-flex items-center gap-1.5 text-out">
                        <Icon name="cash-out" className="size-4" />
                        <Money value={member.equity} bare signed />
                        <span className="sr-only">— has taken out more than he has put in</span>
                      </span>
                    ) : (
                      <Money value={member.equity} bare />
                    )}
                  </td>
                  <td className="td text-right">
                    <Link
                      href={`/print/statement/${member.id}`}
                      className="btn-quiet px-2 py-1.5 text-sm"
                      prefetch={false}
                    >
                      <Icon name="print" className="size-4" />
                      Statement
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-border-strong bg-surface-alt">
              <tr>
                <td className="td font-semibold">All {active.length} members</td>
                <td className="td-num" />
                <td className="td-num font-semibold">
                  <Money value={active.reduce((t, m) => t + m.contributed, 0)} bare />
                </td>
                <td className="td-num font-semibold">
                  <Money value={active.reduce((t, m) => t + m.withdrawn, 0)} bare />
                </td>
                <td className="td-num font-semibold">
                  <Money value={active.reduce((t, m) => t + m.outstanding, 0)} bare />
                </td>
                <td className="td-num font-semibold">
                  <Money value={active.reduce((t, m) => t + m.equity, 0)} bare />
                </td>
                <td className="td" />
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {past.length > 0 ? (
        <section className="card mt-6 overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg">Members who have left</h2>
            <p className="mt-1 text-base text-text-light">
              Their history stays on the books — it is the other members&rsquo; history too.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {past.map((member) => (
              <li key={member.id} className="flex items-center justify-between px-6 py-3">
                <div className="flex items-center gap-3">
                  <Avatar name={member.full_name} className="size-8" />
                  <Link href={`/members/${member.id}`} className="text-primary hover:underline">
                    {member.full_name}
                  </Link>
                </div>
                <Money value={member.contributed} className="text-text-light" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {active.length === 0 ? (
        <EmptyState icon="members" title="No members yet">
          Add the people in the committee — the app cannot work out anything until it knows who
          is in it.
        </EmptyState>
      ) : null}
    </>
  );
}
