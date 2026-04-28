const utc8Formatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function formatUtc8DateTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return "-";
  }

  const source = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(source);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return `${utc8Formatter.format(date)} UTC+8`;
}
