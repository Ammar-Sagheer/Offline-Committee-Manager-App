export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-9 w-72 rounded-lg bg-surface-sunk" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-surface-sunk" />
        ))}
      </div>
      <div className="h-72 rounded-2xl bg-surface-sunk" />
    </div>
  );
}
