import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-5 p-6 text-center">
      <h1 className="text-2xl">That page is not here</h1>
      <p className="text-base text-text-light">
        Nothing in the committee accounts lives at that address.
      </p>
      <Link href="/" className="btn-primary">
        Back to the dashboard
      </Link>
    </main>
  );
}
