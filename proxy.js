import { NextResponse } from "next/server";
import { getIronSession } from "iron-session";

/**
 * The gate. Next 16 renamed middleware.js to proxy.js; same idea.
 *
 * In the web-app version of this structure this file refreshes a Supabase
 * session. Offline there is no session to refresh -- it just checks that the
 * signed cookie is there and sends everyone else to the sign-in screen.
 *
 * This is NOT what protects the books. It only decides whether to redirect. The
 * page's own check and the manager check inside every Server Action are what
 * actually refuse, and the database refuses regardless of either.
 */
const sessionOptions = {
  password: process.env.SESSION_SECRET ?? "development-only-secret-at-least-32-characters",
  cookieName: "committee_session",
  cookieOptions: { httpOnly: true, sameSite: "lax", secure: false },
};

const PUBLIC_PATHS = ["/login", "/setup"];

export default async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  const response = NextResponse.next({ request });
  const session = await getIronSession(request.cookies, sessionOptions);

  if (!session?.user?.id) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
