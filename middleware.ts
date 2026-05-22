import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, isAuthEnabled, verifyAuthCookie } from "@/lib/auth/token";

const PUBLIC_PAGE_PATHS = ["/login"];
const PUBLIC_API_PATHS = [
  "/api/auth/login",
  "/api/auth/logout",
  "/api/cron/check", // 用 CRON_SECRET 自己做鉴权（给 GitHub Actions 用）
];

export async function middleware(req: NextRequest) {
  // 未配置密码 → 整体放行（本地开发友好）
  if (!isAuthEnabled()) return NextResponse.next();

  const { pathname, search } = req.nextUrl;

  if (PUBLIC_PAGE_PATHS.includes(pathname) || PUBLIC_API_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const ok = await verifyAuthCookie(cookie);
  if (ok) return NextResponse.next();

  // API 路径返回 401 JSON
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 页面路径重定向到 /login，并把原 URL 放到 ?next= 以便登录后回跳
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // 跳过静态资源、Next 内部资源；其他都过中间件
  matcher: ["/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)).*)"],
};
