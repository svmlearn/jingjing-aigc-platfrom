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

  return NextResponse.next({ request });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
