"use client";

import Icon from "@/app/_components/ui/Icon";

export default function GlobalError({ error, reset }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-5 p-6 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-danger-soft text-danger">
        <Icon name="warning" className="size-7" />
      </span>
      <h1 className="text-2xl">Something went wrong</h1>
      <p className="text-base text-text-light">
        {error?.message ?? "The app hit a problem it did not expect."}
      </p>
      <p className="text-sm text-text-light">
        Nothing has been saved. Try again, and if it keeps happening, close the app and open it
        once more.
      </p>
      <button type="button" onClick={reset} className="btn-primary">
        Try again
      </button>
    </main>
  );
}
