/**
 * 单密码鉴权的 cookie 签名工具。
 * 用 Web Crypto（Edge-compatible，可直接在 middleware 里调用）。
 *
 * 设计：
 * - cookie 值 = "v1.{HMAC-SHA256(APP_PASSWORD, "v1")}" 的固定字符串
 * - 只要客户端能拿到 cookie 就证明它经过 /api/auth/login（之前提供了正确密码）
 * - 验签用恒定时间比较防 timing attack
 */
export const AUTH_COOKIE_NAME = "app_auth";
const PAYLOAD = "v1";

function getSecret(): string | undefined {
  // 优先使用独立的 AUTH_SECRET；缺省则回落到 APP_PASSWORD（密码本身做签名 key 也 OK）
  return process.env.AUTH_SECRET || process.env.APP_PASSWORD;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createAuthCookieValue(): Promise<string | null> {
  const secret = getSecret();
  if (!secret) return null;
  const sig = await hmacHex(secret, PAYLOAD);
  return `${PAYLOAD}.${sig}`;
}

export async function verifyAuthCookie(value: string | undefined | null): Promise<boolean> {
  if (!value) return false;
  const secret = getSecret();
  if (!secret) return false;
  const [payload, sig] = value.split(".");
  if (payload !== PAYLOAD || !sig) return false;
  const expected = await hmacHex(secret, payload);
  return constantTimeEqual(sig, expected);
}

/** APP_PASSWORD 未配置 → auth 整体关闭（用于本地开发不强制配密码） */
export function isAuthEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}
