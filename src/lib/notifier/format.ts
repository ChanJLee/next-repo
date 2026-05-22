import type { FeishuCardPayload } from "./feishu";
import type { Level } from "@/lib/strategies/types";
import { LEVEL_LABEL } from "@/lib/strategies/types";

export function formatSignalCard(args: {
  ticker: string;
  symbolName?: string | null;
  strategyName: string;
  level: Level;
  prevLevel: Level;
  description: string;
  price: number;
  changePercent: number;
  triggeredAt: Date;
}): FeishuCardPayload {
  const { ticker, symbolName, strategyName, level, prevLevel, description, price, changePercent, triggeredAt } = args;
  const up = level === "long";
  const arrow = up ? "📈" : "📉";
  const sign = changePercent >= 0 ? "+" : "";
  const ts = triggeredAt.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });

  return {
    title: `${arrow} ${ticker} 转${LEVEL_LABEL[level]} · ${strategyName}`,
    headerColor: up ? "red" : "green",
    sections: [
      [
        `**${ticker}**${symbolName ? `  ${symbolName}` : ""}`,
        `**策略**：${strategyName}`,
        `**信号**：${LEVEL_LABEL[prevLevel]} → **${LEVEL_LABEL[level]}**`,
        `**依据**：${description}`,
        `**现价**：\`$${price.toFixed(2)}\`   **涨跌**：\`${sign}${changePercent.toFixed(2)}%\``,
      ].join("\n"),
    ],
    footer: `${ts} · Stock Monitor`,
  };
}
