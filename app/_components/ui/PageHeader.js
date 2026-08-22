export default function PageHeader({ title, description, actions, className = "" }) {
  return (
    <header className={`mb-6 flex flex-wrap items-start justify-between gap-4 ${className}`.trim()}>
      <div className="min-w-0">
        <h1 className="text-2xl">{title}</h1>
        {description ? (
          <p className="mt-1.5 max-w-2xl text-base text-text-light">{description}</p>
        ) : null}
      </div>

      {/* Not shrink-0 at every width: on a 400px screen two buttons at their
          natural width push the whole page sideways, and a page that scrolls
          sideways is how a column ends up hidden. Let them wrap instead. */}
      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>
      ) : null}
    </header>
  );
}
