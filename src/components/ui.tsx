import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

export function Button({
  className,
  variant = "primary",
  ...props
}: ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" &&
          "bg-zinc-950 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200",
        variant === "secondary" &&
          "border border-zinc-200 bg-white text-zinc-950 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-zinc-900",
        variant === "ghost" &&
          "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900",
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none transition-colors placeholder:text-zinc-400 focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:focus:border-zinc-600",
        className,
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  ...props
}: ComponentProps<"section">) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm shadow-zinc-950/[0.02] dark:border-zinc-800 dark:bg-zinc-950",
        className,
      )}
      {...props}
    />
  );
}

export function Badge({
  className,
  ...props
}: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-xs font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300",
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <table
        className={cn("w-full border-collapse text-left text-sm", className)}
        {...props}
      />
    </div>
  );
}

export function Dialog({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-5 dark:border-zinc-700">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
        {children}
      </div>
    </div>
  );
}

export function Drawer({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <aside className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
      <p className="text-sm font-medium">{title}</p>
      <div className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        {children}
      </div>
    </aside>
  );
}

export function Toast({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm shadow-lg shadow-zinc-950/5 dark:border-zinc-800 dark:bg-zinc-950">
      {children}
    </div>
  );
}

export function Tabs({ items }: { items: string[] }) {
  return (
    <div className="inline-flex rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
      {items.map((item, index) => (
        <button
          className={cn(
            "rounded-md px-3 py-1.5 text-sm text-zinc-500",
            index === 0 &&
              "bg-white text-zinc-950 shadow-sm dark:bg-zinc-950 dark:text-zinc-50",
          )}
          key={item}
          type="button"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

export function Breadcrumb({ items }: { items: string[] }) {
  return (
    <nav className="flex items-center gap-2 text-sm text-zinc-500">
      {items.map((item, index) => (
        <span className="flex items-center gap-2" key={item}>
          {index > 0 ? <span>/</span> : null}
          <span className={index === items.length - 1 ? "text-zinc-950 dark:text-zinc-50" : ""}>
            {item}
          </span>
        </span>
      ))}
    </nav>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
        {description}
      </p>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900",
        className,
      )}
    />
  );
}
