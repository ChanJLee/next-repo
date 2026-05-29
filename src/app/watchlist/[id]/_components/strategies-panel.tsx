"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LevelBadge } from "@/components/level-badge";
import { Plus, Trash2, Activity, Sparkles, Info } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { STRATEGY_PRESETS, type StrategyPreset } from "@/lib/strategies/presets";
import {
  runAllBacktests,
  loadCache,
  strategySig,
  windowLabel,
  WINDOW_OPTIONS,
  DEFAULT_WINDOW_DAYS,
  type ClientSummary,
  type BacktestCache,
} from "./backtest-client";

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
    value: "ma_cross",
    label: "MA 金叉死叉",
    description: "双均线交叉：MA50 上穿 MA200 = 多（金叉），下穿 = 空（死叉）。经典中期趋势切换信号。",
    needs: ["maFast", "maSlow", "maType"],
    defaults: { maFast: "50", maSlow: "200", maType: "sma" },
  },
  {
    value: "rsi_extreme",
    label: "RSI 极值",
    description: "趋势过滤的均值回归：仅在上涨趋势（价 > MA）中、RSI 超卖（< 30）才转多，持有到 RSI 回中位（默认 50）才退出，不一碰阈值就跑。空头镜像。",
    needs: ["period", "longBelow", "shortAbove", "exitMid", "trendPeriod"],
    defaults: { period: "14", longBelow: "30", shortAbove: "70", exitMid: "50", trendPeriod: "200" },
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
  {
    value: "candle_pattern",
    label: "经典蜡烛图反转",
    description: "锤子/看涨吞没/晨星 = 多；射击之星/看跌吞没/暮星 = 空。触发后持有 holdBars 根 K 线。趋势过滤防止逆势抓刀。",
    needs: ["holdBars", "trendPeriod"],
    defaults: { holdBars: "5", trendPeriod: "20" },
  },
  {
    value: "selling_climax",
    label: "卖出高潮（见底）",
    description: "下跌趋势中放量长下影 + 累计跌幅 = 抛压释放，机构低位接盘。Wyckoff/VSA 经典见底信号，仅发 long。",
    needs: ["lookback", "volumeMultiple", "tailRatio", "drawdownPct", "holdBars", "trendPeriod", "requireConfirmation"],
    defaults: { lookback: "10", volumeMultiple: "1.8", tailRatio: "0.01", drawdownPct: "-5", holdBars: "10", trendPeriod: "20", requireConfirmation: "1" },
  },
  {
    value: "buying_climax",
    label: "买入高潮（见顶）",
    description: "上涨趋势中放量长上影 + 累计涨幅 = 顶部派发。仅发 short（long-only 回测无交易，作为减仓告警）。",
    needs: ["lookback", "volumeMultiple", "tailRatio", "gainPct", "holdBars", "trendPeriod", "requireConfirmation"],
    defaults: { lookback: "10", volumeMultiple: "1.8", tailRatio: "0.01", gainPct: "5", holdBars: "10", trendPeriod: "20", requireConfirmation: "1" },
  },
];

export function StrategiesPanel({ symbolId, initial }: { symbolId: number; ticker?: string; initial: StrategyVM[] }) {
  const router = useRouter();
  const [strategies, setStrategies] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [busyPresetName, setBusyPresetName] = useState<string | null>(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  // 回测结果：本地计算、点按钮触发，结果连同时间戳+窗口缓存到 localStorage。
  const [summaries, setSummaries] = useState<Record<number, ClientSummary | "loading" | "failed">>({});
  const [cache, setCache] = useState<BacktestCache | null>(null);
  const [windowDays, setWindowDays] = useState<number>(DEFAULT_WINDOW_DAYS);
  const [running, setRunning] = useState(false);
  // 缓存结果仅在「窗口一致」时才算数；切换窗口后需重测。
  const lastRunAt = cache && cache.windowDays === windowDays ? cache.at : null;

  const existingNames = useMemo(() => new Set(strategies.map((s) => s.name)), [strategies]);
  const missingPresetCount = STRATEGY_PRESETS.filter((p) => !existingNames.has(p.name)).length;

  // 服务端返回的 Strategy 行 → StrategyVM
  function toVM(created: Record<string, unknown>): StrategyVM {
    return {
      id: Number(created.id),
      name: String(created.name),
      kind: String(created.kind),
      params: typeof created.params === "string" ? created.params : JSON.stringify(created.params ?? {}),
      currentLevel: String(created.currentLevel ?? "neutral"),
      enabled: Boolean(created.enabled ?? true),
      cooldownSec: Number(created.cooldownSec),
      lastEvalAt: (created.lastEvalAt as string | null) ?? null,
    };
  }

  async function addPreset(preset: StrategyPreset) {
    if (existingNames.has(preset.name) || busyPresetName === preset.name) return;
    setBusyPresetName(preset.name);
    try {
      const res = await fetch("/api/strategies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbolId,
          name: preset.name,
          kind: preset.kind,
          params: preset.params,
          cooldownSec: preset.cooldownSec,
          enabled: true,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        toast.error(typeof j.error === "string" ? j.error : `${preset.name} 添加失败`);
        return;
      }
      const created = await res.json();
      setStrategies((prev) => [toVM(created), ...prev]);
      toast.success(`${preset.name} 已添加`);
      router.refresh();
    } finally {
      setBusyPresetName(null);
    }
  }

  async function addAllPresets() {
    const missing = STRATEGY_PRESETS.filter((p) => !existingNames.has(p.name));
    if (missing.length === 0) return;
    setBulkAdding(true);
    try {
      const results = await Promise.allSettled(
        missing.map(async (p) => {
          const r = await fetch("/api/strategies", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              symbolId,
              name: p.name,
              kind: p.kind,
              params: p.params,
              cooldownSec: p.cooldownSec,
              enabled: true,
            }),
          });
          if (!r.ok) throw new Error(p.name);
          return r.json();
        }),
      );
      const createdVMs = results
        .filter((r): r is PromiseFulfilledResult<Record<string, unknown>> => r.status === "fulfilled")
        .map((r) => toVM(r.value));
      setStrategies((prev) => [...createdVMs, ...prev]);
      const failed = results.length - createdVMs.length;
      if (failed === 0) toast.success(`已添加 ${createdVMs.length} 条预设策略`);
      else toast.warning(`${createdVMs.length} 条成功，${failed} 条失败`);
      router.refresh();
    } finally {
      setBulkAdding(false);
    }
  }

  function refresh() {
    router.refresh();
  }

  // 进页面只读一次本地缓存（不自动回测），并把窗口对齐到上次回测用的窗口。
  useEffect(() => {
    const c = loadCache(symbolId);
    if (!c) return;
    setCache(c);
    setWindowDays(c.windowDays);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 由缓存派生展示用的摘要：仅当缓存窗口 == 当前窗口、且策略签名未变时采用；
  // 否则视为「未回测」。回测进行中不覆盖（保留 loading 态）。
  useEffect(() => {
    if (running) return;
    const map: Record<number, ClientSummary> = {};
    if (cache && cache.windowDays === windowDays) {
      for (const s of strategies) {
        const hit = cache.items[s.id];
        if (hit && hit.sig === strategySig(s)) map[s.id] = hit.summary;
      }
    }
    setSummaries(map);
  }, [cache, windowDays, strategies, running]);

  async function runBacktests() {
    if (running || strategies.length === 0) return;
    setRunning(true);
    setSummaries((prev) => {
      const next = { ...prev };
      for (const s of strategies) next[s.id] = "loading";
      return next;
    });
    try {
      const { cache: newCache, failed } = await runAllBacktests(symbolId, strategies, windowDays);
      setCache(newCache);
      const map: Record<number, ClientSummary | "failed"> = {};
      for (const s of strategies) {
        const hit = newCache.items[s.id];
        map[s.id] = hit ? hit.summary : "failed";
      }
      setSummaries(map);
      if (failed.length === 0) toast.success(`已回测 ${strategies.length} 条策略（${windowLabel(windowDays)}）`);
      else toast.warning(`${strategies.length - failed.length} 条成功，${failed.length} 条失败`);
    } catch (e) {
      // 拉数据失败：清掉 loading，提示
      setSummaries((prev) => {
        const next = { ...prev };
        for (const s of strategies) if (next[s.id] === "loading") delete next[s.id];
        return next;
      });
      toast.error(e instanceof Error ? e.message : "回测失败");
    } finally {
      setRunning(false);
    }
  }

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
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base">策略</CardTitle>
            <CardDescription>每条策略给出 多 / 中 / 空 三种判断，转向多或空时推送飞书</CardDescription>
            <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
              {backtestStatusText(lastRunAt, running, windowLabel(windowDays))}
              <MetricHelp />
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))} disabled={running}>
              <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((w) => (<SelectItem key={w.days} value={String(w.days)}>{w.label}</SelectItem>))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={running || strategies.length === 0} onClick={runBacktests}>
              <Activity className={cn("h-4 w-4", running && "animate-pulse")} /> {running ? "回测中…" : "回测全部"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowPresets(!showPresets)}>
              <Sparkles className="h-4 w-4" /> 从预设添加 {missingPresetCount > 0 ? `(${missingPresetCount})` : null}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAdding(!adding)}>
              <Plus className="h-4 w-4" /> 自定义
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showPresets ? (
          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium">预设策略</div>
                <p className="text-xs text-muted-foreground">内置 {STRATEGY_PRESETS.length} 条已调好参数的策略，可直接添加</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" disabled={missingPresetCount === 0 || bulkAdding} onClick={addAllPresets}>
                  {bulkAdding ? "添加中…" : missingPresetCount === 0 ? "全部已添加" : `一键添加全部 (${missingPresetCount})`}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowPresets(false)}>关闭</Button>
              </div>
            </div>
            <div className="space-y-1.5">
              {STRATEGY_PRESETS.map((p) => {
                const added = existingNames.has(p.name);
                return (
                  <div key={p.name} className="flex items-start justify-between gap-3 rounded border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{p.name}</span>
                        <span className="text-xs text-muted-foreground">· {p.kind}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                    </div>
                    {added ? (
                      <span className="text-xs text-muted-foreground shrink-0 mt-1">已添加</span>
                    ) : (
                      <Button variant="outline" size="sm" disabled={busyPresetName === p.name || bulkAdding} onClick={() => addPreset(p)}>
                        {busyPresetName === p.name ? "…" : "+ 添加"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {adding ? <AddStrategyForm symbolId={symbolId} onAdded={(created) => { setAdding(false); setStrategies((prev) => [toVM(created), ...prev]); router.refresh(); }} onCancel={() => setAdding(false)} /> : null}

        {strategies.length === 0 ? (
          <p className="text-sm text-muted-foreground">还没有策略。点【添加策略】开始。</p>
        ) : (
          <div className="space-y-2">
            {strategies.map((s) => {
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
                        <BacktestSummaryBadge summary={summary} kind={s.kind} windowLbl={windowLabel(windowDays)} />
                        <span className="text-xs text-muted-foreground">· {kindLabel}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {Object.keys(paramObj).length > 0 ? JSON.stringify(paramObj) : "默认参数"} · 冷却 {Math.round(s.cooldownSec / 60)} 分钟
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Switch checked={s.enabled} onCheckedChange={(en) => toggle(s.id, en)} />
                      <Button variant="ghost" size="icon" onClick={() => del(s.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function backtestStatusText(lastRunAt: number | null, running: boolean, windowLbl: string): string {
  if (running) return `回测中…（本地计算，${windowLbl}窗口）`;
  if (!lastRunAt) return `尚未按「${windowLbl}」回测，点右上「回测全部」本地回测`;
  const d = new Date(lastRunAt);
  const ageMs = Date.now() - lastRunAt;
  const ageDay = Math.floor(ageMs / 86400_000);
  const ageHr = Math.floor(ageMs / 3600_000);
  const rel = ageDay >= 1 ? `${ageDay} 天前` : ageHr >= 1 ? `${ageHr} 小时前` : "刚刚";
  const stale = ageDay >= 1 ? "，可能已过期，建议重新回测" : "";
  return `回测于 ${d.toLocaleString("zh-CN", { hour12: false })}（${windowLbl}窗口，${rel}${stale}）`;
}

// 只发单边「空」信号的策略：long-only 回测必然 0 笔交易，胜率/超额对它无意义，
// 单独标成告警型，避免和「参数太严/真没触发」的无交易混淆。
const ALERT_ONLY_KINDS = new Set(["buying_climax"]);

const METRIC_HELP =
  "胜率 = 盈利交易笔数 / 总交易笔数（一次多头买入→卖出算一笔；只看正负、不看幅度）。\n" +
  "超额 = 策略收益 − 买入持有收益（正=跑赢「躺平不动」，负=不如躺平）。\n" +
  "回测为 long-only，不含手续费/滑点/分红；判断策略值不值得做以「超额」为主、胜率为辅。";

// 点击弹出的指标说明气泡（原生 title 只在悬停且有延迟，点击/触屏无反应）。
function MetricHelp() {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex text-muted-foreground hover:text-foreground"
        aria-label="指标说明"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-6 z-50 w-72 whitespace-pre-line rounded-md border bg-popover p-3 text-xs leading-relaxed text-popover-foreground shadow-md">
            {METRIC_HELP}
          </div>
        </>
      ) : null}
    </span>
  );
}

function BacktestSummaryBadge({ summary, kind, windowLbl }: { summary: ClientSummary | "loading" | "failed" | undefined; kind: string; windowLbl: string }) {
  if (ALERT_ONLY_KINDS.has(kind)) {
    return (
      <span
        className="text-xs text-amber-700"
        title="该策略只发空信号（顶部派发告警），long-only 回测不产生交易，胜率/超额不适用"
      >
        顶部告警 · 仅空信号
      </span>
    );
  }
  if (summary === "loading") {
    return <span className="text-xs text-muted-foreground">回测中…</span>;
  }
  if (summary === undefined) {
    return <span className="text-xs text-muted-foreground">未回测</span>;
  }
  if (summary === "failed") {
    return <span className="text-xs text-muted-foreground">回测失败</span>;
  }
  if (summary.numTrades === 0) {
    return (
      <span className="text-xs text-muted-foreground" title={`${windowLbl}窗口内无交易信号`}>
        无交易
      </span>
    );
  }
  const winColor = summary.winRate >= 60 ? "text-green-700" : summary.winRate >= 45 ? "text-amber-700" : "text-red-700";
  const excessColor = summary.excessReturn >= 0 ? "text-green-700" : "text-red-700";
  const tooltip = `回测窗口 ${windowLbl}：策略收益 ${summary.totalReturn.toFixed(1)}%，共 ${summary.numTrades} 次交易\n\n${METRIC_HELP}`;
  return (
    <span className="inline-flex items-center gap-1 text-xs" title={tooltip}>
      <span className={cn("font-medium", winColor)}>胜率 {summary.winRate.toFixed(0)}%</span>
      <span className="text-muted-foreground">·</span>
      <span className={cn(excessColor)}>超额 {summary.excessReturn >= 0 ? "+" : ""}{summary.excessReturn.toFixed(1)}%</span>
    </span>
  );
}

function AddStrategyForm({ symbolId, onAdded, onCancel }: { symbolId: number; onAdded: (created: Record<string, unknown>) => void; onCancel: () => void }) {
  const [kind, setKind] = useState<string>("ma_trend");
  const [name, setName] = useState("");
  const [period, setPeriod] = useState("200");
  const [tolerance, setTolerance] = useState("0");
  const [maType, setMaType] = useState<"sma" | "ema">("sma");
  const [maFast, setMaFast] = useState("50");
  const [maSlow, setMaSlow] = useState("200");
  const [longBelow, setLongBelow] = useState("30");
  const [shortAbove, setShortAbove] = useState("70");
  const [exitMid, setExitMid] = useState("50");
  const [longAbove, setLongAbove] = useState("10");
  const [shortBelow, setShortBelow] = useState("-10");
  const [fast, setFast] = useState("12");
  const [slow, setSlow] = useState("26");
  const [signal, setSignal] = useState("9");
  const [histTolerance, setHistTolerance] = useState("0");
  const [stdDev, setStdDev] = useState("2");
  const [holdBars, setHoldBars] = useState("5");
  const [trendPeriod, setTrendPeriod] = useState("20");
  const [volumeMultiple, setVolumeMultiple] = useState("1.8");
  const [tailRatio, setTailRatio] = useState("0.01");
  const [drawdownPct, setDrawdownPct] = useState("-5");
  const [gainPct, setGainPct] = useState("5");
  const [lookback, setLookback] = useState("10");
  const [requireConfirmation, setRequireConfirmation] = useState(true);
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
    if (d.maFast) setMaFast(d.maFast);
    if (d.maSlow) setMaSlow(d.maSlow);
    if (d.longBelow) setLongBelow(d.longBelow);
    if (d.shortAbove) setShortAbove(d.shortAbove);
    if (d.exitMid) setExitMid(d.exitMid);
    if (d.longAbove) setLongAbove(d.longAbove);
    if (d.shortBelow) setShortBelow(d.shortBelow);
    if (d.fast) setFast(d.fast);
    if (d.slow) setSlow(d.slow);
    if (d.signal) setSignal(d.signal);
    if (d.histTolerance) setHistTolerance(d.histTolerance);
    if (d.stdDev) setStdDev(d.stdDev);
    if (d.holdBars) setHoldBars(d.holdBars);
    if (d.trendPeriod) setTrendPeriod(d.trendPeriod);
    if (d.volumeMultiple) setVolumeMultiple(d.volumeMultiple);
    if (d.tailRatio) setTailRatio(d.tailRatio);
    if (d.drawdownPct) setDrawdownPct(d.drawdownPct);
    if (d.gainPct) setGainPct(d.gainPct);
    if (d.lookback) setLookback(d.lookback);
    if (d.requireConfirmation !== undefined) setRequireConfirmation(d.requireConfirmation === "1");
    if (!name) setName(newSpec.label);
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("请填策略名");
      return;
    }
    const params: Record<string, number | string | boolean> = {};
    if (spec.needs.includes("period")) params.period = Number(period);
    if (spec.needs.includes("tolerance")) params.tolerance = Number(tolerance);
    if (spec.needs.includes("maType")) params.maType = maType;
    if (spec.needs.includes("maFast")) params.maFast = Number(maFast);
    if (spec.needs.includes("maSlow")) params.maSlow = Number(maSlow);
    if (spec.needs.includes("longBelow")) params.longBelow = Number(longBelow);
    if (spec.needs.includes("shortAbove")) params.shortAbove = Number(shortAbove);
    if (spec.needs.includes("exitMid")) params.exitMid = Number(exitMid);
    if (spec.needs.includes("longAbove")) params.longAbove = Number(longAbove);
    if (spec.needs.includes("shortBelow")) params.shortBelow = Number(shortBelow);
    if (spec.needs.includes("fast")) params.fast = Number(fast);
    if (spec.needs.includes("slow")) params.slow = Number(slow);
    if (spec.needs.includes("signal")) params.signal = Number(signal);
    if (spec.needs.includes("histTolerance")) params.histTolerance = Number(histTolerance);
    if (spec.needs.includes("stdDev")) params.stdDev = Number(stdDev);
    if (spec.needs.includes("holdBars")) params.holdBars = Number(holdBars);
    if (spec.needs.includes("trendPeriod")) params.trendPeriod = Number(trendPeriod);
    if (spec.needs.includes("volumeMultiple")) params.volumeMultiple = Number(volumeMultiple);
    if (spec.needs.includes("tailRatio")) params.tailRatio = Number(tailRatio);
    if (spec.needs.includes("drawdownPct")) params.drawdownPct = Number(drawdownPct);
    if (spec.needs.includes("gainPct")) params.gainPct = Number(gainPct);
    if (spec.needs.includes("lookback")) params.lookback = Number(lookback);
    if (spec.needs.includes("requireConfirmation")) params.requireConfirmation = requireConfirmation;

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
    const created = await res.json();
    toast.success("策略已添加");
    onAdded(created);
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
        {spec.needs.includes("maFast") && (
          <div className="flex flex-col gap-1.5"><Label>快线周期 maFast</Label><Input value={maFast} onChange={(e) => setMaFast(e.target.value)} inputMode="numeric" placeholder="如 50" /></div>
        )}
        {spec.needs.includes("maSlow") && (
          <div className="flex flex-col gap-1.5"><Label>慢线周期 maSlow</Label><Input value={maSlow} onChange={(e) => setMaSlow(e.target.value)} inputMode="numeric" placeholder="如 200" /></div>
        )}
        {spec.needs.includes("longBelow") && (
          <div className="flex flex-col gap-1.5"><Label>多阈值（RSI &lt;）</Label><Input value={longBelow} onChange={(e) => setLongBelow(e.target.value)} inputMode="decimal" /></div>
        )}
        {spec.needs.includes("shortAbove") && (
          <div className="flex flex-col gap-1.5"><Label>空阈值（RSI &gt;）</Label><Input value={shortAbove} onChange={(e) => setShortAbove(e.target.value)} inputMode="decimal" /></div>
        )}
        {spec.needs.includes("exitMid") && (
          <div className="flex flex-col gap-1.5"><Label>退出中位值 exitMid</Label><Input value={exitMid} onChange={(e) => setExitMid(e.target.value)} inputMode="decimal" placeholder="RSI 回到该值才平仓（多头），默认 50" /></div>
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
        {spec.needs.includes("holdBars") && (
          <div className="flex flex-col gap-1.5"><Label>持有 K 线数 holdBars</Label><Input value={holdBars} onChange={(e) => setHoldBars(e.target.value)} inputMode="numeric" placeholder="形态触发后维持几根 K 线的级别" /></div>
        )}
        {spec.needs.includes("trendPeriod") && (
          <div className="flex flex-col gap-1.5"><Label>趋势过滤 MA 周期</Label><Input value={trendPeriod} onChange={(e) => setTrendPeriod(e.target.value)} inputMode="numeric" placeholder="0=不过滤，20=MA20 上下方过滤" /></div>
        )}
        {spec.needs.includes("lookback") && (
          <div className="flex flex-col gap-1.5"><Label>回看天数 lookback</Label><Input value={lookback} onChange={(e) => setLookback(e.target.value)} inputMode="numeric" placeholder="10=过去 10 日的均量和跌幅基准" /></div>
        )}
        {spec.needs.includes("volumeMultiple") && (
          <div className="flex flex-col gap-1.5"><Label>放量倍数 volumeMultiple</Label><Input value={volumeMultiple} onChange={(e) => setVolumeMultiple(e.target.value)} inputMode="decimal" placeholder="1.8 = 今日量 ≥ 均量 × 1.8" /></div>
        )}
        {spec.needs.includes("tailRatio") && (
          <div className="flex flex-col gap-1.5"><Label>下影回收 tailRatio</Label><Input value={tailRatio} onChange={(e) => setTailRatio(e.target.value)} inputMode="decimal" placeholder="0.01 = (close-low)/low ≥ 1%" /></div>
        )}
        {spec.needs.includes("drawdownPct") && (
          <div className="flex flex-col gap-1.5"><Label>累计跌幅阈值 drawdownPct (%)</Label><Input value={drawdownPct} onChange={(e) => setDrawdownPct(e.target.value)} inputMode="decimal" placeholder="-5 = 近 lookback 日累计跌幅 ≤ -5%" /></div>
        )}
        {spec.needs.includes("gainPct") && (
          <div className="flex flex-col gap-1.5"><Label>累计涨幅阈值 gainPct (%)</Label><Input value={gainPct} onChange={(e) => setGainPct(e.target.value)} inputMode="decimal" placeholder="5 = 近 lookback 日累计涨幅 ≥ 5%" /></div>
        )}
        {spec.needs.includes("requireConfirmation") && (
          <div className="flex flex-col gap-1.5">
            <Label>次日确认 requireConfirmation</Label>
            <div className="flex items-center gap-2 h-10">
              <Switch checked={requireConfirmation} onCheckedChange={setRequireConfirmation} />
              <span className="text-xs text-muted-foreground">开启=climax 次日收阳才发信号（更稳，少 1 天延迟）</span>
            </div>
          </div>
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
