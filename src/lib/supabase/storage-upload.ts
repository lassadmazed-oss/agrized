import { createClient } from "@supabase/supabase-js";

import { publicEnv } from "@/lib/env";

import type { Database } from "./database.types";

let client: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Browser client used only to upload files with signed upload tokens issued by the server.
 * Holds no session and cannot read private data.
 */
export function getStorageUploadClient() {
  client ??= createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

export const LAND_OFFER_BUCKET = "land-offer-files";
