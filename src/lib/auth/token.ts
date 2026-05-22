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
  // 签名 key 优先级：独立 AUTH_SECRET → APP_API_KEY → APP_PASSWORD（兼容旧命名）
  return process.env.AUTH_SECRET || process.env.APP_API_KEY || process.env.APP_PASSWORD;
}

/** 用户访问凭证的环境变量。优先 APP_API_KEY，向后兼容 APP_PASSWORD */
export function getExpectedApiKey(): string | undefined {
  return process.env.APP_API_KEY || process.env.APP_PASSWORD;
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

/** 未配置访问凭证时 → auth 整体关闭（本地开发免配置） */
export function isAuthEnabled(): boolean {
  return !!getExpectedApiKey();
}
