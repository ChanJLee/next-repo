"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type NavigationItem = {
  label: string;
  href: string;
};

export function AppCommandMenu({ items }: { items: NavigationItem[] }) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredItems = useMemo(() => {
    const value = keyword.trim().toLowerCase();

    if (!value) {
      return items;
    }

    return items.filter((item) => {
      const haystack = `${item.label} ${item.href}`.toLowerCase();

      return haystack.includes(value);
    });
  }, [items, keyword]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setKeyword("");
        setOpen((current) => !current);
      }

      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  return (
    <>
      <button
        className="hidden h-9 min-w-56 rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-left text-sm text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:text-zinc-50 md:block"
        onClick={() => {
          setKeyword("");
          setOpen(true);
        }}
        type="button"
      >
        ⌘K 搜索菜单、单据、客户
      </button>
      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 px-4 pt-24"
          role="dialog"
        >
          <button
            aria-label="关闭搜索"
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
            type="button"
          />
          <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-950/20 dark:border-zinc-800 dark:bg-zinc-950">
            <div className="border-b border-zinc-100 p-4 dark:border-zinc-800">
              <input
                className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-4 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:focus:border-zinc-600"
                onChange={(event) => setKeyword(event.target.value)}
                placeholder="搜索菜单、单据、客户"
                ref={inputRef}
                value={keyword}
              />
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {filteredItems.length === 0 ? (
                <div className="px-3 py-8 text-center text-sm text-zinc-500">
                  没有找到匹配结果
                </div>
              ) : (
                filteredItems.map((item) => (
                  <Link
                    className="block rounded-xl px-3 py-2.5 text-sm transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    href={item.href}
                    key={item.href}
                    onClick={() => setOpen(false)}
                  >
                    <span className="font-medium">{item.label}</span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {item.href}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
