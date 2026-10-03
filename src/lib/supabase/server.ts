import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

import { publicEnv } from "@/lib/env";
import { DISPLAY_LOCALE_HEADER, type Locale } from "@/lib/i18n/locales";
import { auditHeaders } from "@/lib/request-context";

import type { Database } from "./database.types";

/**
 * Supabase client acting as the signed-in user, so Row Level Security applies.
 * Create a new one for every request; never share it.
 *
 * `display` makes the database answer labels in that language (0109 rule 5) — for a read whose answer is
 * shown to the visitor, like the client's own file. Never for a write: intake snapshots stay Arabic.
 */
export async function createClient({ display }: { display?: Locale } = {}) {
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
    global: {
      headers: {
        ...auditHeaders(requestHeaders),
        ...(display && display !== "ar" ? { [DISPLAY_LOCALE_HEADER]: display } : {}),
      },
    },
  });
}
