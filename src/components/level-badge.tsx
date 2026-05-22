import { cn } from "@/lib/utils";

export function LevelBadge({ level, className }: { level: string; className?: string }) {
  const cfg =
    level === "long"
      ? { label: "多", cls: "bg-green-100 text-green-700" }
      : level === "short"
        ? { label: "空", cls: "bg-red-100 text-red-700" }
        : { label: "中", cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium", cfg.cls, className)}>
      {cfg.label}
    </span>
  );
}
