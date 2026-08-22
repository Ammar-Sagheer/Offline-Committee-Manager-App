import { redirect } from "next/navigation";
import { getSetupState } from "@/app/_lib/data-service";
import { siteConfig } from "@/app/_lib/siteConfig";
import SetupForm from "@/app/_components/committee/SetupForm";

export const metadata = { title: "First-time setup" };

/**
 * There is no dashboard anywhere to create the first account from, and no
 * spreadsheet to import. So the app has to be able to describe itself into
 * existence -- the piece of an offline port that is forgotten most often.
 */
export default async function SetupPage() {
  const setup = await getSetupState();
  if (setup.isReady) redirect("/");

  return (
    <main className="mx-auto max-w-3xl p-6 md:p-10">
      <header className="mb-8">
        <h1 className="text-2xl">Set up {siteConfig.name}</h1>
        <p className="mt-2 text-base text-text-light">
          This is asked once. Everything here can be changed afterwards, and every month
          already collected is recorded properly rather than rolled into one opening figure —
          so &ldquo;how much has each person put in&rdquo; has a real answer from day one.
        </p>
      </header>

      <SetupForm />
    </main>
  );
}
