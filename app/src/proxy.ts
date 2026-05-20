import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const STAGING_CANONICAL_HOST = "jingjing-content-platform-staging.vercel.app";
const STAGING_VERCEL_HOST_PREFIX = "jingjing-content-platform-staging";

export async function proxy(request: NextRequest) {
  const host = request.headers.get("host")?.split(":")[0] ?? "";

  if (
    host !== STAGING_CANONICAL_HOST &&
    host.endsWith(".vercel.app") &&
    host.startsWith(STAGING_VERCEL_HOST_PREFIX)
  ) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = STAGING_CANONICAL_HOST;
    url.port = "";

    return NextResponse.redirect(url, 308);
  }

  return updateSupabaseSession(request);
}

async function updateSupabaseSession(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let response = NextResponse.next({ request });

  if (
    process.env.APP_DATABASE_URL ||
    process.env.DATABASE_URL ||
    process.env.DATABASE_PROVIDER === "postgres" ||
    process.env.DOMESTIC_DATABASE_ENABLED === "true"
  ) {
    return response;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
