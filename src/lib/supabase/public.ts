import "server-only";

import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Anonymous client without cookies, for public data (settings, lists, feature flags).
 * Safe to use inside cached functions because it never depends on the visitor.
 */
export function createPublicClient() {
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
