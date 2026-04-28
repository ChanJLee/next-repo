"use client";

import { usePathname } from "next/navigation";

import { Breadcrumb } from "./ui";

type NavigationItem = {
  label: string;
  href: string;
};

function matchesPath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppRouteTitle({ items }: { items: NavigationItem[] }) {
  const pathname = usePathname();
  const activeItem =
    items
      .filter((item) => matchesPath(pathname, item.href))
      .sort((left, right) => right.href.length - left.href.length)[0] ??
    items[0];

  return (
    <div>
      <Breadcrumb items={["首页", activeItem.label]} />
    </div>
  );
}
