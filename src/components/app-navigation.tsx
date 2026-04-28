"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/cn";

type NavigationItem = {
  label: string;
  href: string;
};

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNavigation({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();
  const activeHref = items
    .filter((item) => isActivePath(pathname, item.href))
    .sort((left, right) => right.href.length - left.href.length)[0]?.href;

  return (
    <nav className="mt-8 space-y-1">
      {items.map((item) => {
        const active = item.href === activeHref;

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-9 items-center rounded-lg px-3 text-sm transition-colors",
              active
                ? "bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-900 dark:text-zinc-50"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-950 dark:hover:bg-zinc-900 dark:hover:text-zinc-50",
            )}
            href={item.href}
            key={item.href}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
