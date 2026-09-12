import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Service-role client. Bypasses Row Level Security, so use it only for system operations the
 * visitor cannot perform as themselves (public intake RPCs, file uploads, background jobs).
 * Never import this from a Client Component.
 */
export function createAdminClient(extraHeaders: Record<string, string> = {}) {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing environment variable SUPABASE_SERVICE_ROLE_KEY. Add it to .env.");
  }
  return createClient<Database>(publicEnv.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: extraHeaders },
  });
}
