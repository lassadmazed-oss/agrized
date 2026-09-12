import "server-only";

import { unstable_cache } from "next/cache";

import type { Database } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";

export type FlagState = Database["public"]["Enums"]["flag_state"];

/** Tag to expire after the Back Office changes settings, lists or feature flags. */
export const PUBLIC_CONFIG_TAG = "public-config";

/**
 * The home page is prerendered at build time, so a momentary Supabase hiccup would fail the whole
 * deploy. A couple of short retries turn that into a pause instead of a broken build.
 */
async function withRetry<T>(load: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await load();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }
  throw lastError;
}

const loadPublicConfig = unstable_cache(
  () =>
    withRetry(async () => {
      const supabase = createPublicClient();
      const [settings, flags, governorates, delegations, projectTypes, scenarios, options, media] = await Promise.all([
        supabase.from("settings").select("key, value").eq("is_public", true),
        supabase.from("feature_flags").select("key, state"),
        supabase.from("governorates").select("id, name_ar, name_fr").eq("is_active", true).order("sort_order"),
        supabase
          .from("delegations")
          .select("id, governorate_id, name_ar, name_fr")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("project_types")
          .select("id, code, label_ar, description_ar, image_url, image_alt_ar")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("ownership_scenarios")
          .select("id, code, label_ar, description_ar, project_type_id, plantation_system, production_status, is_any")
          .eq("is_active", true)
          .order("sort_order"),
        supabase
          .from("option_items")
          .select("id, list_key, code, label_ar, min_millimes, max_millimes, min_number, max_number, time_from, time_to")
          .eq("is_active", true)
          .order("sort_order"),
        supabase.from("site_media").select("slot, url, alt_ar, aspect, credit_text, credit_url"),
      ]);

      for (const result of [settings, flags, governorates, delegations, projectTypes, scenarios, options, media]) {
        if (result.error) throw new Error(`Could not load public configuration: ${result.error.message}`);
      }

      return {
        settings: Object.fromEntries((settings.data ?? []).map((row) => [row.key, row.value])),
        flags: Object.fromEntries((flags.data ?? []).map((row) => [row.key, row.state])) as Record<string, FlagState>,
        governorates: governorates.data ?? [],
        delegations: delegations.data ?? [],
        projectTypes: projectTypes.data ?? [],
        scenarios: scenarios.data ?? [],
        options: options.data ?? [],
        media: Object.fromEntries((media.data ?? []).map((row) => [row.slot, row])),
      };
    }),
  ["public-config-v4"],
  { tags: [PUBLIC_CONFIG_TAG], revalidate: 300 },
);

export type PublicConfig = Awaited<ReturnType<typeof loadPublicConfig>>;
export type OptionItem = PublicConfig["options"][number];
export type Governorate = PublicConfig["governorates"][number];
export type Delegation = PublicConfig["delegations"][number];
export type ProjectType = PublicConfig["projectTypes"][number];
export type OwnershipScenario = PublicConfig["scenarios"][number];
export type MediaSlot = PublicConfig["media"][string];

export function getPublicConfig(): Promise<PublicConfig> {
  return loadPublicConfig();
}

export function settingText(config: PublicConfig, key: string, fallback = ""): string {
  const value = config.settings[key];
  return typeof value === "string" ? value : fallback;
}

export function settingBool(config: PublicConfig, key: string, fallback = false): boolean {
  const value = config.settings[key];
  return typeof value === "boolean" ? value : fallback;
}

export function settingInt(config: PublicConfig, key: string, fallback: number): number {
  const value = config.settings[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function settingJson<T>(config: PublicConfig, key: string, fallback: T): T {
  const value = config.settings[key];
  return value === undefined || value === null ? fallback : (value as T);
}

export function optionsFor(config: PublicConfig, listKey: string): OptionItem[] {
  return config.options.filter((option) => option.list_key === listKey);
}

/** A picture slot (MED-01). Returns undefined when AgriZed has not uploaded one yet. */
export function mediaFor(config: PublicConfig, slot: string): MediaSlot | undefined {
  const row = config.media[slot];
  return row?.url ? row : undefined;
}

/** Photo credits the licences require us to print (CC BY). Own and CC0 pictures carry none. */
export function mediaCredits(config: PublicConfig): { text: string; url: string | null }[] {
  return Object.values(config.media)
    .filter((row) => row.url && row.credit_text)
    .map((row) => ({ text: row.credit_text as string, url: row.credit_url }));
}

export function flagState(config: PublicConfig, key: string): FlagState {
  return config.flags[key] ?? "disabled";
}
