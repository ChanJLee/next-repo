import { prisma } from "@/lib/db";
import { WatchlistManager } from "./_components/manager";

export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const symbols = await prisma.symbol.findMany({
    orderBy: { createdAt: "desc" },
    include: { rules: { orderBy: { createdAt: "desc" } } },
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">监控列表</h1>
      <WatchlistManager initialSymbols={symbols.map((s) => ({
        id: s.id,
        ticker: s.ticker,
        name: s.name,
        enabled: s.enabled,
        rules: s.rules.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          indicator: r.indicator,
          params: r.params,
          cooldownSec: r.cooldownSec,
          enabled: r.enabled,
        })),
      }))} />
    </div>
  );
}
