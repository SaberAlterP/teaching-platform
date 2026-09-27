"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ links }: { links: { href: string; label: string; badge?: number }[] }) {
  const path = usePathname();
  return (
    <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm sm:gap-1">
      {links.map((l) => {
        const active = l.href === path || (l.href !== "/teacher" && l.href !== "/learn" && path.startsWith(l.href))
          || (l.href === "/teacher" && path.startsWith("/teacher/lessons"));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`relative whitespace-nowrap rounded-lg px-2 py-1.5 font-medium transition sm:px-3 ${
              active ? "bg-brand-50 text-brand-600" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {l.label}
            {!!l.badge && (
              <span className="ml-1 rounded-full bg-red-500 px-1.5 text-xs text-white">{l.badge}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
