import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { publicEnv } from "@/lib/env";
import { auditHeaders } from "@/lib/request-context";

import type { Database } from "./database.types";

/**
 * Supabase client acting as the signed-in user, so Row Level Security applies.
 * Create a new one for every request; never share it.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const requestHeaders = await headers();

  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. src/proxy.ts refreshes the session instead.
        }
      },
    },
    global: { headers: auditHeaders(requestHeaders) },
  });
}
