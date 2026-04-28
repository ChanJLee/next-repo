function normalizeMoney(value: string) {
  const [yuan = "0", cents = ""] = value.split(".");
  return BigInt(yuan) * BigInt(100) + BigInt((cents + "00").slice(0, 2));
}

export function formatMoney(cents: bigint) {
  const zero = BigInt(0);
  const hundred = BigInt(100);
  const sign = cents < zero ? "-" : "";
  const abs = cents < zero ? -cents : cents;
  const yuan = abs / hundred;
  const fen = `${abs % hundred}`.padStart(2, "0");
  return `${sign}${yuan}.${fen}`;
}

export function addMoney(left: string, right: string) {
  return formatMoney(normalizeMoney(left) + normalizeMoney(right));
}

export function subtractMoney(left: string, right: string) {
  return formatMoney(normalizeMoney(left) - normalizeMoney(right));
}

export function compareMoney(left: string, right: string) {
  const diff = normalizeMoney(left) - normalizeMoney(right);
  const zero = BigInt(0);
  return diff === zero ? 0 : diff > zero ? 1 : -1;
}

export function multiplyMoney(unitPrice: string, qty: string) {
  const qtyThousandths = BigInt(Math.round(Number(qty) * 1000));
  return formatMoney(
    (normalizeMoney(unitPrice) * qtyThousandths) / BigInt(1000),
  );
}

export function addQty(left: string, right: string) {
  return `${Number(left) + Number(right)}`;
}

export function subtractQty(left: string, right: string) {
  return `${Number(left) - Number(right)}`;
}
