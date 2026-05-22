"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LevelBadge } from "@/components/level-badge";
import { Plus, Trash2, Activity, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { BacktestInline } from "./backtest-inline";

interface BacktestSummary {
  winRate: number;
  excessReturn: number;
  totalReturn: number;
  numTrades: number;
}

// 默认拉取窗口 = 2 年（与 BacktestInline 一致）
const SUMMARY_DAYS = 730;

export interface StrategyVM {
  id: number;
  name: string;
  kind: string;
  params: string;
  currentLevel: string;
  enabled: boolean;
  cooldownSec: number;
  lastEvalAt: string | null;
}

interface KindSpec {
  value: string;
  label: string;
  description: string;
  needs: string[];
  defaults: Record<string, string>;
}

const KINDS: KindSpec[] = [
  {
    value: "ma_trend",
    label: "MA 趋势",
    description: "价格站在长均线之上=多，跌破=空。最经典的趋势 regime filter（如 MA200）。",
    needs: ["period", "tolerance", "maType"],
    defaults: { period: "200", tolerance: "0", maType: "sma" },
  },
  {
    value: "rsi_extreme",
    label: "RSI 极值",
    description: "RSI 超卖（< 30）= 多（加仓机会），超买（> 70）= 空。均值回归思路。",
    needs: ["period", "longBelow", "shortAbove"],
    defaults: { period: "14", longBelow: "30", shortAbove: "70" },
  },
  {
    value: "macd",
    label: "MACD",
    description: "MACD 柱状图 > 0 = 多，< 0 = 空。动量趋势指标。",
    needs: ["fast", "slow", "signal", "histTolerance"],
    defaults: { fast: "12", slow: "26", signal: "9", histTolerance: "0" },
  },
  {
    value: "roc_momentum",
    label: "ROC 动量",
    description: "N 日涨跌幅超过阈值。例：12个月动量 > 10% = 多（Antonacci 双动量基础）。",
    needs: ["period", "longAbove", "shortBelow"],
    defaults: { period: "252", longAbove: "10", shortBelow: "-10" },
  },
  {
    value: "donchian",
    label: "Donchian 通道",
    description: "突破 N 日新高 = 多，跌破 N 日新低 = 空。海龟交易经典策略。",
    needs: ["period"],
    defaults: { period: "252" },
  },
  {
    value: "bb_reversion",
    label: "布林带均值回归",
    description: "跌破下轨 = 多（买入机会），冲破上轨 = 空。震荡市场较好。",
    needs: ["period", "stdDev"],
    defaults: { period: "20", stdDev: "2" },
  },
];

export function StrategiesPanel({ symbolId, ticker, initial }: { symbolId: number; ticker: string; initial: StrategyVM[] }) {
  const router = useRouter();
  const [strategies, setStrategies] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [expandedBacktest, setExpandedBacktest] = useState<number | null>(null);
  const [summaries, setSummaries] = useState<Record<number, BacktestSummary | "loading" | "failed">>({});

  function refresh() {
    router.refresh();
  }

  // 进入页面 / 策略增删时，异步并行拉所有策略的回测摘要
  const strategyKey = useMemo(() => strategies.map((s) => s.id).join(","), [strategies]);
  useEffect(() => {
    let aborted = false;
    if (strategies.length === 0) {
      setSummaries({});
      return;
    }
    setSummaries((prev) => {
      const next = { ...prev };
      for (const s of strategies) if (!next[s.id] || next[s.id] === "failed") next[s.id] = "loading";
      return next;
    });
    for (const s of strategies) {
      fetch(`/api/strategies/${s.id}/backtest?days=${SUMMARY_DAYS}`)
        .then(async (res) => {
          if (aborted) return;
          if (!res.ok) {
            setSummaries((p) => ({ ...p, [s.id]: "failed" }));
            return;
          }
          const j = await res.json();
          setSummaries((p) => ({
            ...p,
            [s.id]: {
              winRate: j.winRate,
              excessReturn: j.excessReturn,
              totalReturn: j.totalReturn,
              numTrades: j.numTrades,
            },
          }));
        })
        .catch(() => {
          if (!aborted) setSummaries((p) => ({ ...p, [s.id]: "failed" }));
        });
    }
    return () => { aborted = true; };
  }, [strategyKey, strategies]);

  async function toggle(id: number, enabled: boolean) {
    await fetch(`/api/strategies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setStrategies((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  }

  async function del(id: number) {
    if (!confirm("删除该策略？")) return;
    await fetch(`/api/strategies/${id}`, { method: "DELETE" });
    setStrategies((prev) => prev.filter((s) => s.id !== id));
    if (expandedBacktest === id) setExpandedBacktest(null);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">策略</CardTitle>
            <CardDescription>每条策略给出 多 / 中 / 空 三种判断，转向多或空时推送飞书</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setAdding(!adding)}>
            <Plus className="h-4 w-4" /> 添加策略
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding ? <AddStrategyForm symbolId={symbolId} onAdded={() => { setAdding(false); refresh(); }} onCancel={() => setAdding(false)} /> : null}

        {strategies.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有策略。点【添加策略】开始。</p>
        ) : (
          <div className="space-y-2">
            {strategies.map((s) => {
              const isExpanded = expandedBacktest === s.id;
              const kindLabel = KINDS.find((k) => k.value === s.kind)?.label ?? s.kind;
              const paramObj = (() => { try { return JSON.parse(s.params); } catch { return {}; } })();
              const summary = summaries[s.id];
              return (
                <div key={s.id} className="rounded-md border">
                  <div className="flex items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{s.name}</span>
                        <LevelBadge level={s.currentLevel} />
                        <BacktestSummaryBadge summary={summary} />
                        <span className="text-xs text-muted-foreground">· {kindLabel}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {Object.keys(paramObj).length > 0 ? JSON.stringify(paramObj) : "默认参数"} · 冷却 {Math.round(s.cooldownSec / 60)} 分钟
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setExpandedBacktest(isExpanded ? null : s.id)}>
                        <Activity className="h-4 w-4" /> 回测
                        {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </Button>
                      <Switch checked={s.enabled} onCheckedChange={(en) => toggle(s.id, en)} />
                      <Button variant="ghost" size="icon" onClick={() => del(s.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <div className="border-t bg-muted/30 p-3">
                      <BacktestInline strategyId={s.id} ticker={ticker} />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BacktestSummaryBadge({ summary }: { summary: BacktestSummary | "loading" | "failed" | undefined }) {
  if (summary === undefined || summary === "loading") {
    return <span className="text-xs text-muted-foreground">回测中…</span>;
  }
  if (summary === "failed") {
    return <span className="text-xs text-muted-foreground">回测失败</span>;
  }
  if (summary.numTrades === 0) {
    return (
      <span className="text-xs text-muted-foreground" title={`近 ${SUMMARY_DAYS} 天无交易信号`}>
        无交易
      </span>
    );
  }
  const winColor = summary.winRate >= 60 ? "text-green-700" : summary.winRate >= 45 ? "text-amber-700" : "text-red-700";
  const excessColor = summary.excessReturn >= 0 ? "text-green-700" : "text-red-700";
  const tooltip = `回测窗口 2 年：策略收益 ${summary.totalReturn.toFixed(1)}%，共 ${summary.numTrades} 次交易`;
  return (
    <span className="inline-flex items-center gap-1 text-xs" title={tooltip}>
      <span className={cn("font-medium", winColor)}>胜率 {summary.winRate.toFixed(0)}%</span>
      <span className="text-muted-foreground">·</span>
      <span className={cn(excessColor)}>超额 {summary.excessReturn >= 0 ? "+" : ""}{summary.excessReturn.toFixed(1)}%</span>
    </span>
  );
}

function AddStrategyForm({ symbolId, onAdded, onCancel }: { symbolId: number; onAdded: () => void; onCancel: () => void }) {
  const [kind, setKind] = useState<string>("ma_trend");
  const [name, setName] = useState("");
  const [period, setPeriod] = useState("200");
  const [tolerance, setTolerance] = useState("0");
  const [maType, setMaType] = useState<"sma" | "ema">("sma");
  const [longBelow, setLongBelow] = useState("30");
  const [shortAbove, setShortAbove] = useState("70");
  const [longAbove, setLongAbove] = useState("10");
  const [shortBelow, setShortBelow] = useState("-10");
  const [fast, setFast] = useState("12");
  const [slow, setSlow] = useState("26");
  const [signal, setSignal] = useState("9");
  const [histTolerance, setHistTolerance] = useState("0");
  const [stdDev, setStdDev] = useState("2");
  const [cooldownMin, setCooldownMin] = useState("60");

  const spec = KINDS.find((k) => k.value === kind)!;

  function handleKindChange(v: string) {
    setKind(v);
    const newSpec = KINDS.find((k) => k.value === v);
    if (!newSpec) return;
    const d = newSpec.defaults;
    if (d.period) setPeriod(d.period);
    if (d.tolerance) setTolerance(d.tolerance);
    if (d.maType) setMaType(d.maType as "sma" | "ema");
    if (d.longBelow) setLongBelow(d.longBelow);
    if (d.shortAbove) setShortAbove(d.shortAbove);
    if (d.longAbove) setLongAbove(d.longAbove);
    if (d.shortBelow) setShortBelow(d.shortBelow);
    if (d.fast) setFast(d.fast);
    if (d.slow) setSlow(d.slow);
    if (d.signal) setSignal(d.signal);
    if (d.histTolerance) setHistTolerance(d.histTolerance);
    if (d.stdDev) setStdDev(d.stdDev);
    if (!name) setName(newSpec.label);
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("请填策略名");
      return;
    }
    const params: Record<string, number | string> = {};
    if (spec.needs.includes("period")) params.period = Number(period);
    if (spec.needs.includes("tolerance")) params.tolerance = Number(tolerance);
    if (spec.needs.includes("maType")) params.maType = maType;
    if (spec.needs.includes("longBelow")) params.longBelow = Number(longBelow);
    if (spec.needs.includes("shortAbove")) params.shortAbove = Number(shortAbove);
    if (spec.needs.includes("longAbove")) params.longAbove = Number(longAbove);
    if (spec.needs.includes("shortBelow")) params.shortBelow = Number(shortBelow);
    if (spec.needs.includes("fast")) params.fast = Number(fast);
    if (spec.needs.includes("slow")) params.slow = Number(slow);
    if (spec.needs.includes("signal")) params.signal = Number(signal);
    if (spec.needs.includes("histTolerance")) params.histTolerance = Number(histTolerance);
    if (spec.needs.includes("stdDev")) params.stdDev = Number(stdDev);

    const res = await fetch("/api/strategies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbolId,
        name,
        kind,
        params,
        cooldownSec: Math.max(60, Number(cooldownMin) * 60),
        enabled: true,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(typeof j.error === "string" ? j.error : "策略创建失败");
      return;
    }
    toast.success("策略已添加");
    onAdded();
  }

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>策略类型</Label>
          <Select value={kind} onValueChange={handleKindChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KINDS.map((k) => (<SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{spec.description}</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>策略名</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={spec.label} />
        </div>

        {spec.needs.includes("period") && (
          <div className="flex flex-col gap-1.5"><Label>周期 period</Label><Input value={period} onChange={(e) => setPeriod(e.target.value)} inputMode="numeric" /></div>
        )}
        {spec.needs.includes("tolerance") && (
          <div className="flex flex-col gap-1.5"><Label>中性缓冲 tolerance (%)</Label><Input value={tolerance} onChange={(e) => setTolerance(e.target.value)} inputMode="decimal" placeholder="0=严格穿越判定" /></div>
        )}
        {spec.needs.includes("maType") && (
          <div className="flex flex-col gap-1.5">
            <Label>MA 类型</Label>
            <Select value={maType} onValueChange={(v) => setMaType(v as "sma" | "ema")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="sma">SMA</SelectItem><SelectItem value="ema">EMA</SelectItem></SelectContent>
            </Select>
          </div>
        )}
        {spec.needs.includes("longBelow") && (
          <div className="flex flex-col gap-1.5"><Label>多阈值（RSI &lt;）</Label><Input value={longBelow} onChange={(e) => setLongBelow(e.target.value)} inputMode="decimal" /></div>
        )}
        {spec.needs.includes("shortAbove") && (
          <div className="flex flex-col gap-1.5"><Label>空阈值（RSI &gt;）</Label><Input value={shortAbove} onChange={(e) => setShortAbove(e.target.value)} inputMode="decimal" /></div>
        )}
        {spec.needs.includes("longAbove") && (
          <div className="flex flex-col gap-1.5"><Label>多阈值（ROC % &gt;）</Label><Input value={longAbove} onChange={(e) => setLongAbove(e.target.value)} inputMode="decimal" /></div>
        )}
        {spec.needs.includes("shortBelow") && (
          <div className="flex flex-col gap-1.5"><Label>空阈值（ROC % &lt;）</Label><Input value={shortBelow} onChange={(e) => setShortBelow(e.target.value)} inputMode="decimal" /></div>
        )}
        {spec.needs.includes("fast") && (
          <div className="flex flex-col gap-1.5"><Label>MACD 快线</Label><Input value={fast} onChange={(e) => setFast(e.target.value)} inputMode="numeric" /></div>
        )}
        {spec.needs.includes("slow") && (
          <div className="flex flex-col gap-1.5"><Label>MACD 慢线</Label><Input value={slow} onChange={(e) => setSlow(e.target.value)} inputMode="numeric" /></div>
        )}
        {spec.needs.includes("signal") && (
          <div className="flex flex-col gap-1.5"><Label>MACD 信号线</Label><Input value={signal} onChange={(e) => setSignal(e.target.value)} inputMode="numeric" /></div>
        )}
        {spec.needs.includes("histTolerance") && (
          <div className="flex flex-col gap-1.5"><Label>柱状图中性带宽</Label><Input value={histTolerance} onChange={(e) => setHistTolerance(e.target.value)} inputMode="decimal" /></div>
        )}
        {spec.needs.includes("stdDev") && (
          <div className="flex flex-col gap-1.5"><Label>布林标准差倍数</Label><Input value={stdDev} onChange={(e) => setStdDev(e.target.value)} inputMode="decimal" /></div>
        )}
        <div className="flex flex-col gap-1.5"><Label>冷却时间（分钟）</Label><Input value={cooldownMin} onChange={(e) => setCooldownMin(e.target.value)} inputMode="numeric" /></div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>取消</Button>
        <Button size="sm" onClick={submit}>保存</Button>
      </div>
    </div>
  );
}
