/**
 * 简化版美股交易时段判断：09:30–16:00 America/New_York，周一到周五。
 * 不处理美国节假日 —— 节假日触发会被 yahoo-finance2 自动返回前一交易日数据，
 * cooldown 机制会兜底防止重复推送。
 */
export function isMarketOpen(now: Date = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const weekday = parts.find((p) => p.type === "weekday")?.value;
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  if (!weekday || weekday === "Sat" || weekday === "Sun") return false;
  const totalMin = hour * 60 + minute;
  return totalMin >= 9 * 60 + 30 && totalMin < 16 * 60;
}
