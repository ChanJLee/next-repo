import { NextResponse, type NextRequest } from "next/server";

import {
  sessionCookieName,
  verifySessionTokenEdge,
} from "@/server/auth/session-edge";

const publicRoutes = ["/login", "/register"];

function isPublicRoute(pathname: string) {
  return publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export async function proxy(request: NextRequest) {
  const session = await verifySessionTokenEdge(
    request.cookies.get(sessionCookieName)?.value,
  );
  const { pathname } = request.nextUrl;

  if (!session && !isPublicRoute(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (session && isPublicRoute(pathname)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  if (!session) {
    return NextResponse.next();
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-session-user-id", session.userId);
  requestHeaders.set("x-session-tenant-id", session.tenantId);
  requestHeaders.set("x-session-org-id", session.orgId);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
