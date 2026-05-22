"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { triggerCheckAction } from "./trigger-check.action";

export function TriggerCheckButton() {
  const [loading, setLoading] = useState(false);

  async function run(force: boolean) {
    setLoading(true);
    try {
      const report = await triggerCheckAction(force);
      if (report.skipped) {
        toast.message(report.skipped, { description: "可以点【强制检查】绕过时段限制" });
      } else if (report.errors.length > 0) {
        toast.warning(
          `检查完成：策略 ${report.strategiesEvaluated} 条，转向 ${report.transitions}`,
          { description: `${report.errors.length} 个错误，查看部署日志` },
        );
      } else {
        toast.success(`检查完成：策略 ${report.strategiesEvaluated} 条，转向 ${report.transitions}`);
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
