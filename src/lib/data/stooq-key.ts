import { cookies } from "next/headers";

export const STOOQ_COOKIE_NAME = "stooq_apikey";

/**
 * 从请求 cookie 读取用户保存的 Stooq apikey。
 * 用于 server-side API route 中把 key 透传给数据层；cron 路径无 request 上下文，直接走 process.env.STOOQ_APIKEY。
 */
export function getStooqApikeyFromCookie(): string | undefined {
  return cookies().get(STOOQ_COOKIE_NAME)?.value || undefined;
}
