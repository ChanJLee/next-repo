import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createAuthCookieValue } from "@/lib/auth/token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === "string" ? body.password : "";
  const expected = process.env.APP_PASSWORD;
  if (!expected) {
    return NextResponse.json({ error: "未在服务端配置 APP_PASSWORD" }, { status: 500 });
  }
  if (password !== expected) {
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  }
  const value = await createAuthCookieValue();
  if (!value) {
    return NextResponse.json({ error: "签名失败" }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: THIRTY_DAYS,
  });
  return res;
}
