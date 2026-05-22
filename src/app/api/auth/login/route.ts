import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, createAuthCookieValue, getExpectedApiKey } from "@/lib/auth/token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const apiKey = typeof body.apiKey === "string" ? body.apiKey : "";
  const expected = getExpectedApiKey();
  if (!expected) {
    return NextResponse.json({ error: "服务端未启用访问校验" }, { status: 500 });
  }
  if (apiKey !== expected) {
    return NextResponse.json({ error: "无效的 API Key" }, { status: 401 });
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
