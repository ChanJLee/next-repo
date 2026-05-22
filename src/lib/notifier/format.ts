export function formatAlertMarkdown(args: {
  ticker: string;
  symbolName?: string | null;
  ruleName: string;
  description: string;
  price: number;
  changePercent: number;
  triggeredAt: Date;
}): { title: string; markdown: string } {
  const { ticker, symbolName, ruleName, description, price, changePercent, triggeredAt } = args;
  const arrow = changePercent >= 0 ? "📈" : "📉";
  const sign = changePercent >= 0 ? "+" : "";
  const ts = triggeredAt.toLocaleString("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour12: false,
  });

  const title = `${arrow} ${ticker} - ${ruleName}`;
  const markdown = [
    `### ${arrow} 行情告警：${ticker}${symbolName ? ` (${symbolName})` : ""}`,
    ``,
    `**规则**：${ruleName}`,
    ``,
    `**触发**：${description}`,
    ``,
    `**现价**：\`$${price.toFixed(2)}\`  **涨跌**：\`${sign}${changePercent.toFixed(2)}%\``,
    ``,
    `> ${ts}`,
  ].join("\n");

  return { title, markdown };
}
