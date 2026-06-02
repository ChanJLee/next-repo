"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

export function BackfillButton({ symbolId }: { symbolId: number }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function run() {
    setLoading(true);
    try {
      // all=1：拉上市以来全部 Stooq 复权历史，并整段替换（拆股/分红后会重新复权）。
      const res = await fetch(`/api/symbols/${symbolId}/backfill?all=1`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "回填失败");
        return;
      }
      if (json.replaced) {
        toast.success(`已复权重灌 ${json.inserted} 条历史（来源 ${json.source}）`);
      } else if (json.inserted > 0) {
        toast.success(`新增 ${json.inserted} 条历史（更新 ${json.updated}，来源 ${json.source}）`);
      } else {
        toast.message(`已是最新，无新增`, { description: `该区间库内已有 ${json.fetched} 条` });
      }
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "网络错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={loading} title="拉取上市以来全部历史并复权重灌（拆股/分红后会重新复权）">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      回填/复权历史
    </Button>
  );
}
