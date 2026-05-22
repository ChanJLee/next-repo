"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function TriggerCheckButton() {
  const [loading, setLoading] = useState(false);

  async function run(force: boolean) {
    setLoading(true);
    try {
      const res = await fetch(`/api/cron/check${force ? "?force=1" : ""}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "执行失败");
      } else if (json.skipped) {
        toast.message(json.skipped, { description: "可以点【强制检查】绕过时段限制" });
      } else {
        toast.success(`检查完成：评估 ${json.rulesEvaluated} 条，触发 ${json.triggered}，飞书推送 ${json.pushed}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex gap-2">
      <Button onClick={() => run(false)} disabled={loading}>
        {loading ? "检查中…" : "手动检查"}
      </Button>
      <Button onClick={() => run(true)} disabled={loading} variant="outline" size="sm">
        强制检查
      </Button>
    </div>
  );
}
