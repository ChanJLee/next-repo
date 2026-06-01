"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function BackfillButton({ symbolId, days = 1825 }: { symbolId: number; days?: number }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function run() {
    setLoading(true);
    try {
      const res = await fetch(`/api/symbols/${symbolId}/backfill?days=${days}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "回填失败");
        return;
      }
      if (json.inserted > 0) {
        toast.success(`新增 ${json.inserted} 条历史（更新 ${json.updated}，来源 ${json.source}）`);
      } else {
        toast.message(`已是最新，无新增`, { description: `该区间库内已有 ${json.fetched} 条（更新最近 ${json.updated} 条）` });
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={loading}>
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      回填历史
    </Button>
  );
}
