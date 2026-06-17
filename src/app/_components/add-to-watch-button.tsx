"use client";

import { useState } from "react";
import { Plus, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

/** 一键把某 ticker 加入监控列表（调 POST /api/symbols，自动回填历史）。 */
export function AddToWatchButton({ ticker, name }: { ticker: string; name?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  async function add() {
    if (state !== "idle") return;
    setState("loading");
    try {
      const res = await fetch("/api/symbols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, name: name || undefined }),
      });
      if (res.ok) {
        const j: { backfill?: { inserted: number } | null } = await res.json().catch(() => ({}));
        toast.success(`${ticker} 已加入监控${j.backfill?.inserted ? ` · 回填 ${j.backfill.inserted} 条` : ""}`);
        setState("done");
      } else if (res.status === 409) {
        toast.message(`${ticker} 已在监控列表`);
        setState("done");
      } else {
        const j = await res.json().catch(() => ({}));
        toast.error(j.error ?? "添加失败");
        setState("idle");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "请求失败");
      setState("idle");
    }
  }

  return (
    <button
      type="button"
      onClick={add}
      disabled={state !== "idle"}
      title={state === "done" ? "已在监控" : "加入监控"}
      aria-label={`加入监控 ${ticker}`}
      className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60 disabled:hover:bg-transparent"
    >
      {state === "loading" ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
        : state === "done" ? <Check className="h-3.5 w-3.5 text-green-600" />
        : <Plus className="h-3.5 w-3.5" />}
    </button>
  );
}
