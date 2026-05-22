import type { FeishuCardPayload } from "./feishu";

export function formatAlertCard(args: {
  ticker: string;
  symbolName?: string | null;
  ruleName: string;
  description: string;
  price: number;
  changePercent: number;
  triggeredAt: Date;
}): FeishuCardPayload {
  const { ticker, symbolName, ruleName, description, price, changePercent, triggeredAt } = args;
  const up = changePercent >= 0;
  const arrow = up ? "📈" : "📉";
  const sign = up ? "+" : "";
  const ts = triggeredAt.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });

  return {
    title: `${arrow} ${ticker} · ${ruleName}`,
    headerColor: up ? "red" : "green",
    sections: [
      [
        `**${ticker}**${symbolName ? `  ${symbolName}` : ""}`,
        `**规则**：${ruleName}`,
        `**触发**：${description}`,
        `**现价**：\`$${price.toFixed(2)}\`   **涨跌**：\`${sign}${changePercent.toFixed(2)}%\``,
      ].join("\n"),
    ],
    footer: `${ts} · Stock Monitor`,
  };
}
