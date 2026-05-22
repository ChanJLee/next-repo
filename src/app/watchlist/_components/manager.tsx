"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus, LineChart } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";

export interface RuleVM {
  id: number;
  name: string;
  type: string;
  indicator: string | null;
  params: string;
  cooldownSec: number;
  enabled: boolean;
}

export interface SymbolVM {
  id: number;
  ticker: string;
  name: string | null;
  enabled: boolean;
  rules: RuleVM[];
}

const INDICATOR_OPTIONS: { value: string; label: string; type: "price" | "technical" | "volume"; needs: string[] }[] = [
  { value: "price_above", label: "价格 ≥ 阈值", type: "price", needs: ["threshold"] },
  { value: "price_below", label: "价格 ≤ 阈值", type: "price", needs: ["threshold"] },
  { value: "change_percent_above", label: "涨幅 ≥ %", type: "price", needs: ["threshold"] },
  { value: "change_percent_below", label: "跌幅 ≤ %（填负数）", type: "price", needs: ["threshold"] },
  { value: "rsi_above", label: "RSI ≥ 阈值（超买）", type: "technical", needs: ["threshold", "period"] },
  { value: "rsi_below", label: "RSI ≤ 阈值（超卖）", type: "technical", needs: ["threshold", "period"] },
  { value: "ma_cross_up", label: "MA 金叉（快线上穿慢线）", type: "technical", needs: ["fast", "slow", "maType"] },
  { value: "ma_cross_down", label: "MA 死叉", type: "technical", needs: ["fast", "slow", "maType"] },
  { value: "macd_cross_up", label: "MACD 上穿信号线", type: "technical", needs: [] },
  { value: "macd_cross_down", label: "MACD 下穿信号线", type: "technical", needs: [] },
  { value: "bb_break_upper", label: "突破布林上轨", type: "technical", needs: ["window", "stdDev"] },
  { value: "bb_break_lower", label: "跌破布林下轨", type: "technical", needs: ["window", "stdDev"] },
  { value: "volume_spike", label: "成交量放量（× 均值）", type: "volume", needs: ["multiplier", "window"] },
];

export function WatchlistManager({ initialSymbols }: { initialSymbols: SymbolVM[] }) {
  const router = useRouter();
  const [symbols, setSymbols] = useState(initialSymbols);
  const [newTicker, setNewTicker] = useState("");
  const [newName, setNewName] = useState("");

  async function refresh() {
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
    setNewTicker("");
    setNewName("");
    toast.success("已添加");
    refresh();
  }

  async function toggleSymbol(id: number, enabled: boolean) {
    await fetch(`/api/symbols/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
    setSymbols((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  }

  async function deleteSymbol(id: number) {
    if (!confirm("删除股票会一并删除其所有规则，确定？")) return;
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
        symbols.map((sym) => (
          <SymbolCard
            key={sym.id}
            symbol={sym}
            onToggle={(en) => toggleSymbol(sym.id, en)}
            onDelete={() => deleteSymbol(sym.id)}
            onRulesChanged={refresh}
          />
        ))
      )}
    </div>
  );
}

function SymbolCard({
  symbol,
  onToggle,
  onDelete,
  onRulesChanged,
}: {
  symbol: SymbolVM;
  onToggle: (enabled: boolean) => void;
  onDelete: () => void;
  onRulesChanged: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-lg">
            <Link href={`/watchlist/${symbol.id}`} className="hover:underline">{symbol.ticker}</Link>
            {symbol.name ? <span className="ml-2 text-sm font-normal text-muted-foreground">{symbol.name}</span> : null}
          </CardTitle>
          <div className="text-xs text-muted-foreground mt-1">{symbol.rules.length} 条规则</div>
        </div>
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link href={`/watchlist/${symbol.id}`}>
              <LineChart className="h-4 w-4" /> 走势图
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Switch checked={symbol.enabled} onCheckedChange={onToggle} />
            <span className="text-xs text-muted-foreground">{symbol.enabled ? "启用" : "停用"}</span>
          </div>
          <Button variant="ghost" size="icon" onClick={onDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <RulesList symbolId={symbol.id} rules={symbol.rules} onChanged={onRulesChanged} />
        <AddRuleForm symbolId={symbol.id} onAdded={onRulesChanged} />
      </CardContent>
    </Card>
  );
}

function RulesList({ symbolId: _symbolId, rules, onChanged }: { symbolId: number; rules: RuleVM[]; onChanged: () => void }) {
  if (rules.length === 0) return <p className="text-xs text-muted-foreground">还没有规则。</p>;

  async function toggle(id: number, enabled: boolean) {
    await fetch(`/api/rules/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled }) });
    onChanged();
  }
  async function del(id: number) {
    if (!confirm("删除规则？")) return;
    await fetch(`/api/rules/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="divide-y rounded-md border">
      {rules.map((r) => {
        const params = (() => { try { return JSON.parse(r.params); } catch { return {}; } })();
        return (
          <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="font-medium">{r.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {r.indicator} {Object.keys(params).length > 0 ? `· ${JSON.stringify(params)}` : ""} · 冷却 {Math.round(r.cooldownSec / 60)} 分钟
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={r.enabled} onCheckedChange={(en) => toggle(r.id, en)} />
              <Button variant="ghost" size="icon" onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AddRuleForm({ symbolId, onAdded }: { symbolId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [indicator, setIndicator] = useState<string>("price_above");
  const [name, setName] = useState("");
  const [threshold, setThreshold] = useState("");
  const [period, setPeriod] = useState("14");
  const [fast, setFast] = useState("5");
  const [slow, setSlow] = useState("20");
  const [maType, setMaType] = useState<"sma" | "ema">("sma");
  const [multiplier, setMultiplier] = useState("2");
  const [window, setWindow] = useState("20");
  const [stdDev, setStdDev] = useState("2");
  const [cooldownMin, setCooldownMin] = useState("60");

  const opt = INDICATOR_OPTIONS.find((o) => o.value === indicator)!;

  async function submit() {
    if (!name.trim()) {
      toast.error("请填规则名");
      return;
    }
    const params: Record<string, number | string> = {};
    if (opt.needs.includes("threshold")) {
      if (threshold === "") { toast.error("请填阈值"); return; }
      params.threshold = Number(threshold);
    }
    if (opt.needs.includes("period")) params.period = Number(period);
    if (opt.needs.includes("fast")) params.fast = Number(fast);
    if (opt.needs.includes("slow")) params.slow = Number(slow);
    if (opt.needs.includes("maType")) params.maType = maType;
    if (opt.needs.includes("multiplier")) params.multiplier = Number(multiplier);
    if (opt.needs.includes("window")) params.window = Number(window);
    if (opt.needs.includes("stdDev")) params.stdDev = Number(stdDev);

    const res = await fetch("/api/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbolId,
        name,
        type: opt.type,
        indicator,
        params,
        cooldownSec: Math.max(60, Number(cooldownMin) * 60),
        enabled: true,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      toast.error(typeof j.error === "string" ? j.error : "规则创建失败");
      return;
    }
    toast.success("规则已添加");
    setOpen(false);
    setName("");
    setThreshold("");
    onAdded();
  }

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> 添加规则
      </Button>
    );
  }

  return (
    <div className="rounded-md border p-3 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label>规则类型</Label>
          <Select value={indicator} onValueChange={setIndicator}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {INDICATOR_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>规则名</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 突破 200 美元" />
        </div>

        {opt.needs.includes("threshold") && (
          <div className="flex flex-col gap-1.5">
            <Label>阈值</Label>
            <Input value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder="数字" inputMode="decimal" />
          </div>
        )}
        {opt.needs.includes("period") && (
          <div className="flex flex-col gap-1.5">
            <Label>周期</Label>
            <Input value={period} onChange={(e) => setPeriod(e.target.value)} inputMode="numeric" />
          </div>
        )}
        {opt.needs.includes("fast") && (
          <div className="flex flex-col gap-1.5">
            <Label>快线周期</Label>
            <Input value={fast} onChange={(e) => setFast(e.target.value)} inputMode="numeric" />
          </div>
        )}
        {opt.needs.includes("slow") && (
          <div className="flex flex-col gap-1.5">
            <Label>慢线周期</Label>
            <Input value={slow} onChange={(e) => setSlow(e.target.value)} inputMode="numeric" />
          </div>
        )}
        {opt.needs.includes("maType") && (
          <div className="flex flex-col gap-1.5">
            <Label>MA 类型</Label>
            <Select value={maType} onValueChange={(v) => setMaType(v as "sma" | "ema")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sma">SMA</SelectItem>
                <SelectItem value="ema">EMA</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {opt.needs.includes("multiplier") && (
          <div className="flex flex-col gap-1.5">
            <Label>倍数（× 均值）</Label>
            <Input value={multiplier} onChange={(e) => setMultiplier(e.target.value)} inputMode="decimal" />
          </div>
        )}
        {opt.needs.includes("window") && (
          <div className="flex flex-col gap-1.5">
            <Label>窗口长度</Label>
            <Input value={window} onChange={(e) => setWindow(e.target.value)} inputMode="numeric" />
          </div>
        )}
        {opt.needs.includes("stdDev") && (
          <div className="flex flex-col gap-1.5">
            <Label>布林标准差倍数</Label>
            <Input value={stdDev} onChange={(e) => setStdDev(e.target.value)} inputMode="decimal" />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label>冷却时间（分钟）</Label>
          <Input value={cooldownMin} onChange={(e) => setCooldownMin(e.target.value)} inputMode="numeric" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>取消</Button>
        <Button size="sm" onClick={submit}>保存</Button>
      </div>
    </div>
  );
}
