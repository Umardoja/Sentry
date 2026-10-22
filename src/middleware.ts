import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "sentry_session";

/** Avoid rendering the investigation workspace when no server-issued session cookie exists. */
export function middleware(request: NextRequest) {
  if (!request.cookies.get(SESSION_COOKIE)?.value) return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}

export const config = { matcher: ["/"] };
