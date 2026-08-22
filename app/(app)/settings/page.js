import {
  getSettings, getUsers, getDashboard, getSettingsHistory, getMaxSafePayout,
} from "@/app/_lib/data-service";
import { getSessionUser } from "@/app/_lib/helpers";
import { money } from "@/app/_lib/format-helpers";
import { dayMonth } from "@/app/_lib/date-helpers";
import { siteConfig } from "@/app/_lib/siteConfig";
import PageHeader from "@/app/_components/ui/PageHeader";
import Icon from "@/app/_components/ui/Icon";
import SettingsForm from "@/app/_components/committee/SettingsForm";
import PasswordForm from "@/app/_components/committee/PasswordForm";
import UserAdmin from "@/app/_components/committee/UserAdmin";
import BackupPanel from "@/app/_components/committee/BackupPanel";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getSessionUser();
  const readOnly = user.role !== "manager";

  const [settings, users, summary, history, maxSafe] = await Promise.all([
    getSettings(), getUsers(), getDashboard(), getSettingsHistory(10), getMaxSafePayout(),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="The committee's own rules, the logins, and where the books actually live."
      />

      <section className="card p-6">
        <h2 className="text-lg">The committee&rsquo;s rules</h2>
        <p className="mt-1 mb-5 text-base text-text-light">
          Changing any of these only affects what happens next. Nothing already recorded is
          rewritten — a member halfway through repaying keeps the installment he was given.
        </p>
        <SettingsForm settings={settings} maxSafe={maxSafe} readOnly={readOnly} />
      </section>

      {history.length > 0 ? (
        <section className="card mt-6 overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <h2 className="text-lg">What has been changed</h2>
            <p className="mt-1 text-base text-text-light">
              Money settings get changed late at night and argued about in the morning. This keeps
              the argument short.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 px-6 py-3 text-base">
                <span className="text-text-light">{dayMonth(String(row.changed_at).slice(0, 10))}</span>
                <span className="font-medium">{row.field.replace(/_/g, " ")}</span>
                <span className="num text-text-light">{row.old_value}</span>
                <Icon name="chevron" className="size-4 text-text-light" />
                <span className="num font-medium">{row.new_value}</span>
                {row.changed_by_name ? (
                  <span className="text-text-light">by {row.changed_by_name}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card mt-6 p-6">
        <h2 className="text-lg">Your password</h2>
        <p className="mt-1 mb-5 text-base text-text-light">
          Signed in as <span className="font-medium">{user.name}</span> ({user.username}).
        </p>
        <PasswordForm />
      </section>

      <section className="card mt-6 overflow-hidden">
        <div className="border-b border-border px-6 py-4">
          <h2 className="text-lg">Who can open this app</h2>
          <p className="mt-1 text-base text-text-light">
            A read-only login lets a member look at the books on this laptop and change nothing.
            It does not work from another computer — the app only ever answers on this machine,
            which is what makes it safe to run without any of the usual protections.
          </p>
        </div>
        <UserAdmin users={users} currentUserId={user.id} readOnly={readOnly} />
      </section>

      <BackupPanel />

      <p className="mt-6 text-sm text-text-light">
        {siteConfig.name} — {summary.member_count} members, {money(settings.contribution_amount)} a
        month each, withdrawals repaid over {settings.repayment_term_months} months.
      </p>
    </>
  );
}
