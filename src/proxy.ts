import { NextResponse, type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

// Only signed-in areas go through Supabase, so public pages stay fast for visitors.
export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Optimistic redirect only. Every Back Office page and action checks roles on the server.
  if (!userId && pathname !== "/admin/login" && pathname !== "/admin/setup") {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/admin/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
