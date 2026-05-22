"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, LineChart } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LevelBadge } from "@/components/level-badge";

interface StrategyMini {
  id: number;
  name: string;
  currentLevel: string;
  enabled: boolean;
}

export interface SymbolVM {
  id: number;
  ticker: string;
  name: string | null;
  enabled: boolean;
  strategies: StrategyMini[];
}

export function WatchlistManager({ initialSymbols }: { initialSymbols: SymbolVM[] }) {
  const router = useRouter();
  const [symbols, setSymbols] = useState(initialSymbols);
  const [newTicker, setNewTicker] = useState("");
  const [newName, setNewName] = useState("");

  function refresh() {
    router.refresh();
  }

  async function addSymbol() {
    if (!newTicker.trim()) return;
    const res = await fetch("/api/symbols", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticker: newTicker, name: newName || undefined }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(j.error?.fieldErrors ? "格式错误" : j.error ?? "添加失败");
      return;
    }
    const j: { backfill?: { inserted: number; source: string } | null; backfillError?: string | null } = await res.json().catch(() => ({}));
    setNewTicker("");
    setNewName("");
    if (j.backfill && j.backfill.inserted > 0) {
      toast.success(`已添加 · 回填 ${j.backfill.inserted} 条历史（${j.backfill.source}）`);
    } else if (j.backfillError) {
      toast.warning(`已添加，但历史回填失败：${j.backfillError}`, { duration: 6000 });
    } else {
      toast.success("已添加");
    }
    refresh();
  }

  async function toggleSymbol(id: number, enabled: boolean) {
    await fetch(`/api/symbols/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
    setSymbols((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  }

  async function deleteSymbol(id: number) {
    if (!confirm("删除股票会一并删除其所有策略和信号记录，确定？")) return;
    await fetch(`/api/symbols/${id}`, { method: "DELETE" });
    setSymbols((prev) => prev.filter((s) => s.id !== id));
    toast.success("已删除");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">添加股票</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ticker">Ticker</Label>
              <Input id="ticker" placeholder="如 AAPL" value={newTicker} onChange={(e) => setNewTicker(e.target.value)} className="w-32" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">备注名称（可选）</Label>
              <Input id="name" placeholder="如 苹果" value={newName} onChange={(e) => setNewName(e.target.value)} className="w-48" />
            </div>
            <Button onClick={addSymbol}><Plus className="h-4 w-4" /> 添加</Button>
          </div>
        </CardContent>
      </Card>

      {symbols.length === 0 ? (
        <p className="text-sm text-muted-foreground">还没有监控的股票。添加一个 ticker 开始吧。</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {symbols.map((sym) => (
            <Card key={sym.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <CardTitle className="text-lg">
                      <Link href={`/watchlist/${sym.id}`} className="hover:underline">{sym.ticker}</Link>
                    </CardTitle>
                    {sym.name ? <div className="text-xs text-muted-foreground mt-1 truncate">{sym.name}</div> : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Switch checked={sym.enabled} onCheckedChange={(en) => toggleSymbol(sym.id, en)} />
                    <Button variant="ghost" size="icon" onClick={() => deleteSymbol(sym.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {sym.strategies.length === 0 ? (
                  <p className="text-xs text-muted-foreground">没有策略</p>
                ) : (
                  <div className="space-y-1.5">
                    {sym.strategies.slice(0, 4).map((s) => (
                      <div key={s.id} className="flex items-center justify-between text-xs">
                        <span className={`truncate ${s.enabled ? "" : "text-muted-foreground line-through"}`}>{s.name}</span>
                        <LevelBadge level={s.currentLevel} />
                      </div>
                    ))}
                    {sym.strategies.length > 4 ? (
                      <div className="text-xs text-muted-foreground">+{sym.strategies.length - 4} 条</div>
                    ) : null}
                  </div>
                )}
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={`/watchlist/${sym.id}`}><LineChart className="h-4 w-4" /> 进入详情</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
