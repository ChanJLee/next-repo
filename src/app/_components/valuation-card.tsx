import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { evaluate, VERDICT_LABEL, type Verdict, type ValuationInput } from "@/lib/valuation/models";
import valuation from "@/lib/data/valuation.json";

// 估值快照卡：对 valuation.json 里每只票跑五模型，展示各角度结论 + 综合判断。
// 定位与纳指看板一致——信息参考，非买卖建议（用户：买卖多少是他自己的责任）。
const VERDICT_CLS: Record<Verdict, string> = {
  cheap: "bg-green-100 text-green-700",
  fair: "bg-slate-100 text-slate-600",
  rich: "bg-red-100 text-red-700",
};

export function ValuationCard() {
  const data = valuation as { note: string; companies: ValuationInput[] };
  if (data.companies.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">估值快照（多模型）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          五个独立角度交叉判断现价「便宜 / 合理 / 偏贵」。结论各异是常态——单模型易被假设带偏，交叉看才清楚。信息参考，非买卖建议。
        </p>
        {data.companies.map((c) => {
          const res = evaluate(c);
          return (
            <div key={c.ticker} className="rounded-md border p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.ticker}</span>
                  <span className="text-sm">${c.price.toFixed(1)}</span>
                  <span className="text-xs text-muted-foreground">市值 ${(c.marketCapB / 1000).toFixed(2)}T</span>
                </div>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${VERDICT_CLS[res.overall.verdict]}`}>
                  综合：{res.overall.label}
                </span>
              </div>
              <ul className="mt-2 divide-y">
                {res.models.map((m) => (
                  <li key={m.key} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`shrink-0 rounded px-1.5 py-0.5 ${VERDICT_CLS[m.verdict]}`}>{VERDICT_LABEL[m.verdict]}</span>
                      <span className="font-medium">{m.label}</span>
                    </div>
                    <span className="truncate text-right text-muted-foreground">{m.detail}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-muted-foreground">
                数据 {c.asOf} · DCF 用正常化 FCF ${c.fcfBaseB}B / 折现 {c.discountRatePct}% / 永续 {c.terminalGrowthPct}%。结论对假设敏感，仅供框架参考。
              </p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
