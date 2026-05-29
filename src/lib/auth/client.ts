/**
 * 纯前端鉴权（不写数据库、不走服务端）。
 *
 * 校验方式：浏览器用 Web Crypto 算 SHA-256，与环境变量里预存的哈希比对。
 * 用户名/密码本身不会出现在代码里，只有它们的哈希被注入到
 * NEXT_PUBLIC_AUTH_USER_HASH / NEXT_PUBLIC_AUTH_PASS_HASH。
 *
 * ⚠️ 这是「轻量门帘」而非真正的访问控制：哈希会进客户端 bundle，
 * 弱口令可被离线爆破，逻辑也能在 DevTools 里绕过。仅用于挡一挡。
 */

// 盐不是密钥（同样会进 bundle），只为避免裸哈希被彩虹表直接命中。
const SALT = "stock-monitor::v1";

const FLAG_KEY = "app_auth_ok";

function userHash(): string | undefined {
  return process.env.NEXT_PUBLIC_AUTH_USER_HASH;
}
function passHash(): string | undefined {
  return process.env.NEXT_PUBLIC_AUTH_PASS_HASH;
}

/** 两个哈希都配置了才算启用鉴权；否则整体放行（本地开发免配置）。 */
export function isAuthConfigured(): boolean {
  return !!userHash() && !!passHash();
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(`${SALT}:${input}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** 校验用户名+密码是否与预存哈希一致。 */
export async function verifyCredentials(username: string, password: string): Promise<boolean> {
  const u = userHash();
  const p = passHash();
  if (!u || !p) return false;
  const [uh, ph] = await Promise.all([sha256Hex(username), sha256Hex(password)]);
  // 两个比较都跑满，避免按字段提前返回的 timing 差异。
  const okUser = constantTimeEqual(uh, u);
  const okPass = constantTimeEqual(ph, p);
  return okUser && okPass;
}

/** 标记已登录（仅前端状态，存 localStorage）。 */
export function setLoggedIn(): void {
  try {
    localStorage.setItem(FLAG_KEY, "1");
  } catch {
    /* localStorage 不可用时忽略 */
  }
}

export function isLoggedIn(): boolean {
  if (!isAuthConfigured()) return true; // 未启用 → 视为已登录
  try {
    return localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function logout(): void {
  try {
    localStorage.removeItem(FLAG_KEY);
  } catch {
    /* ignore */
  }
}
