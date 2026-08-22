"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icon from "./Icon";

export default function NavLink({ href, icon, children, exact = false }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-base font-medium ${
        active
          ? "bg-primary-soft text-primary"
          : "text-text-light hover:bg-surface-sunk hover:text-text"
      }`}
    >
      <Icon name={icon} className="size-5 shrink-0" />
      <span>{children}</span>
      {/* Colour is not the only cue that this is the current page: it also
          carries aria-current, and a bar the eye can find without reading. */}
      {active ? <span aria-hidden="true" className="ml-auto h-5 w-1 rounded-full bg-primary" /> : null}
    </Link>
  );
}
