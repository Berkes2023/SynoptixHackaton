import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { LOCAL_MODE_COOKIE, supabaseEnv } from "@/lib/supabase/config";
import { APP_ROUTES } from "@/lib/site/config";

/**
 * Refreshes the Supabase session cookie on every matched request and sends
 * signed-out visitors from workspace routes to the login page. Does nothing
 * when Supabase is not configured (browser-only demo).
 */
export async function middleware(req: NextRequest) {
  const env = supabaseEnv();
  if (!env) return NextResponse.next();

  let res = NextResponse.next({ request: req });
  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  // getUser() validates the token with Supabase Auth; never trust the cookie alone.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = req.nextUrl.pathname;
  const isWorkspace = APP_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
  if (isWorkspace && !user && req.cookies.get(LOCAL_MODE_COOKIE)?.value !== "local") {
    const login = req.nextUrl.clone();
    login.pathname = "/login";
    login.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(login);
  }
  return res;
}

export const config = {
  // Workspace pages, auth pages and the session-backed APIs.
  matcher: ["/dashboard/:path*", "/imports/:path*", "/jobs/:path*", "/audits/:path*", "/fairness-lab/:path*", "/investigations/:path*", "/reports/:path*", "/settings/:path*", "/drift/:path*", "/agents/:path*", "/login", "/onboarding", "/auth/:path*", "/api/v1/workspace/:path*", "/api/v1/workflows/:path*", "/api/v1/events/:path*", "/api/v1/members/:path*", "/api/v1/session/:path*"],
};
