/**
 * Every icon in the app, in one module.
 *
 * Call sites write <Icon name="cash-in" />, so swapping the whole set later is
 * one file. Drawn here rather than pulled from a package: the app has to work
 * with no internet and no font CDN, and a handful of paths is smaller than a
 * dependency.
 *
 * Icons are aria-hidden and always sit beside their own label, so a screen
 * reader is not made to announce the same thing twice. The exception is an
 * icon-only button, which carries its label in aria-label.
 */
const PATHS = {
  dashboard: "M3 10.5 12 3l9 7.5M5.25 9.75V19.5a.75.75 0 0 0 .75.75h4.5v-6h3v6h4.5a.75.75 0 0 0 .75-.75V9.75",
  members: "M15 19.5a6 6 0 0 0-12 0M9 11.25a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5ZM21 19.5a5.25 5.25 0 0 0-3.75-5.03M16.5 10.5a3 3 0 1 0 0-6",
  month: "M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 5.25h15a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75h-15a.75.75 0 0 1-.75-.75V6a.75.75 0 0 1 .75-.75Z",
  history: "M3.75 12a8.25 8.25 0 1 0 2.42-5.83M3.75 4.5V9h4.5M12 7.5V12l3 1.5",
  projection: "M3.75 20.25h16.5M6 17.25V12M10.5 17.25V7.5M15 17.25v-6.75M19.5 17.25V4.5",
  settings: "M10.34 3.94a1.5 1.5 0 0 1 3.32 0l.12.68a7.5 7.5 0 0 1 1.62.67l.57-.4a1.5 1.5 0 0 1 2.35 1.36l-.06.7a7.5 7.5 0 0 1 1.18 1.18l.7-.06a1.5 1.5 0 0 1 1.36 2.35l-.4.57a7.5 7.5 0 0 1 .67 1.62l.68.12a1.5 1.5 0 0 1 0 3.32l-.68.12a7.5 7.5 0 0 1-.67 1.62l.4.57a1.5 1.5 0 0 1-1.36 2.35l-.7-.06a7.5 7.5 0 0 1-1.18 1.18l.06.7a1.5 1.5 0 0 1-2.35 1.36l-.57-.4a7.5 7.5 0 0 1-1.62.67l-.12.68a1.5 1.5 0 0 1-3.32 0M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  check: "m4.5 12.75 5.25 5.25L19.5 6.75",
  cross: "M6 6l12 12M18 6 6 18",
  plus: "M12 4.5v15m7.5-7.5h-15",
  minus: "M4.5 12h15",
  "cash-in": "M12 19.5V4.5m0 0-6 6m6-6 6 6",
  "cash-out": "M12 4.5v15m0 0 6-6m-6 6-6-6",
  warning: "M12 9v4.5m0 3.75h.008M10.36 3.59 2.7 17.25A1.5 1.5 0 0 0 4 19.5h16a1.5 1.5 0 0 0 1.3-2.25L13.64 3.59a1.5 1.5 0 0 0-2.6 0Z",
  blocked: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM5.64 5.64l12.72 12.72",
  info: "M11.25 11.25h.75v4.5h.75M12 8.25h.008M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  print: "M6.75 8.25V3.75h10.5v4.5M6.75 18H5.25A1.5 1.5 0 0 1 3.75 16.5v-5.25a1.5 1.5 0 0 1 1.5-1.5h13.5a1.5 1.5 0 0 1 1.5 1.5v5.25A1.5 1.5 0 0 1 18.75 18h-1.5M6.75 14.25h10.5v6H6.75z",
  lock: "M7.5 10.5V7.5a4.5 4.5 0 1 1 9 0v3M6 10.5h12a.75.75 0 0 1 .75.75v8.25a.75.75 0 0 1-.75.75H6a.75.75 0 0 1-.75-.75v-8.25A.75.75 0 0 1 6 10.5Z",
  unlock: "M7.5 10.5V7.5a4.5 4.5 0 0 1 8.72-1.5M6 10.5h12a.75.75 0 0 1 .75.75v8.25a.75.75 0 0 1-.75.75H6a.75.75 0 0 1-.75-.75v-8.25A.75.75 0 0 1 6 10.5Z",
  signout: "M15.75 9V5.25a1.5 1.5 0 0 0-1.5-1.5h-7.5a1.5 1.5 0 0 0-1.5 1.5v13.5a1.5 1.5 0 0 0 1.5 1.5h7.5a1.5 1.5 0 0 0 1.5-1.5V15M12 12h9m0 0-3-3m3 3-3 3",
  chevron: "m9 5.25 6.75 6.75L9 18.75",
  undo: "M9 14.25 4.5 9.75 9 5.25M4.5 9.75h9.75a5.25 5.25 0 0 1 0 10.5H9",
  clock: "M12 7.5V12l3 1.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  trophy: "M8.25 3.75h7.5v5.25a3.75 3.75 0 1 1-7.5 0V3.75ZM8.25 5.25H5.25v1.5a3 3 0 0 0 3 3M15.75 5.25h3v1.5a3 3 0 0 1-3 3M9.75 20.25h4.5M12 12.75v7.5",
};

export default function Icon({ name, className = "size-5", strokeWidth = 1.8 }) {
  const d = PATHS[name];
  if (!d) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
