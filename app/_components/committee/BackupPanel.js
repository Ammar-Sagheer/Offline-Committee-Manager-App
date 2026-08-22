"use client";

import { useEffect, useState } from "react";
import Icon from "@/app/_components/ui/Icon";
import FormMessage from "@/app/_components/ui/FormMessage";

/**
 * Backing the books up, from inside the app.
 *
 * This talks to the Electron main process rather than a Server Action, and the
 * reason is structural: a Server Action runs inside the Next.js child process,
 * which is connected to the very database being replaced — and Windows will not
 * rename a directory while anything has a file open inside it. Only the main
 * process can stop the server, swap the folder and relaunch.
 *
 * The instructions live here, on this screen, rather than in a README. The
 * person who needs them is sitting at a reinstalled machine with no project
 * checkout and no internet.
 */
export default function BackupPanel() {
  const [desktop, setDesktop] = useState(false);
  const [folder, setFolder] = useState(null);
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.desktop?.isDesktop) return;
    setDesktop(true);
    window.desktop.dataFolder().then(setFolder).catch(() => {});
  }, []);

  const run = async (job, label) => {
    setBusy(label);
    setState(null);
    try {
      setState(await window.desktop[job]());
    } catch (error) {
      setState({ ok: false, message: error.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="card mt-6 p-6">
      <h2 className="text-lg">Backing up</h2>
      <p className="mt-1 text-base text-text-light">
        Everything is in one folder on this laptop. Nothing is sent anywhere and nothing needs the
        internet — which also means nothing else has a copy.
      </p>

      <dl className="mt-4 space-y-4 text-base">
        <div>
          <dt className="stat-label">The folder</dt>
          <dd className="mt-1 break-all rounded-lg bg-surface-sunk px-3 py-2 font-mono text-sm">
            {folder ?? "shown when the app runs from its installer"}
          </dd>
        </div>
        <div>
          <dt className="stat-label">What has to be copied</dt>
          <dd className="mt-1">
            Both halves, always: <span className="font-mono text-sm">db-data</span> is the books,
            and <span className="font-mono text-sm">config.json</span> holds the passwords that
            open them. Postgres keeps its own passwords inside the cluster and that file is the
            only record of what they are — so half a backup restores into nothing at all.
          </dd>
        </div>
        <div>
          <dt className="stat-label">Where to put it</dt>
          <dd className="mt-1">
            A USB stick, and take it out of the building. A backup sitting next to the original is
            lost with the original.
          </dd>
        </div>
        <div>
          <dt className="stat-label">After restoring</dt>
          <dd className="mt-1">
            Sign in with the password from the <span className="font-medium">backup</span>, not
            whatever was set up on the new machine. The logins come with the books.
          </dd>
        </div>
      </dl>

      {state ? <FormMessage state={state} className="mt-5" /> : null}

      {desktop ? (
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" className="btn-primary" disabled={Boolean(busy)}
                  onClick={() => run("backup", "backup")}>
            <Icon name="cash-in" className="size-5" />
            {busy === "backup" ? "Copying…" : "Back up now"}
          </button>
          <button type="button" className="btn" disabled={Boolean(busy)}
                  onClick={() => run("restore", "restore")}>
            <Icon name="undo" className="size-5" />
            Restore from a backup
          </button>
          <button type="button" className="btn" onClick={() => window.desktop.openDataFolder()}>
            <Icon name="month" className="size-5" />
            Open the folder
          </button>
        </div>
      ) : (
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-surface-alt px-4 py-3 text-base text-text-light">
          <Icon name="info" className="mt-0.5 size-5 shrink-0" />
          <span>
            The backup and restore buttons appear when the app is running as the installed desktop
            program. They cannot work from a browser — restoring has to stop the database, and only
            the desktop app can do that.
          </span>
        </p>
      )}
    </section>
  );
}
