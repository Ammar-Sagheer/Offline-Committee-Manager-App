import { redirect } from "next/navigation";
import { anyUsersExist, getSessionUser } from "@/app/_lib/helpers";
import { siteConfig } from "@/app/_lib/siteConfig";
import LoginForm from "@/app/_components/committee/LoginForm";

export const metadata = { title: "Sign in" };

export default async function LoginPage() {
  // Asked through a narrow SECURITY DEFINER function, not by reading the users
  // table. Reading it while signed out returns nothing under any sensible
  // policy, which looks exactly like a fresh install -- and would send an
  // existing user back to the setup screen every time they signed out.
  if (!(await anyUsersExist())) redirect("/setup");
  if (await getSessionUser()) redirect("/");

  return (
    <main className="grid min-h-screen place-items-center bg-surface-alt p-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl">{siteConfig.name}</h1>
          <p className="mt-1 text-base text-text-light">{siteConfig.committeeName}</p>
        </div>
        <div className="card p-6">
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-sm text-text-light">
          This app runs entirely on this laptop. Nothing is sent anywhere.
        </p>
      </div>
    </main>
  );
}
