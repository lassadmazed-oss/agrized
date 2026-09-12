import "server-only";

import { unstable_cache } from "next/cache";

import type { Database } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";

export type FlagState = Database["public"]["Enums"]["flag_state"];

/** Tag to expire after the Back Office changes settings, lists or feature flags. */
export const PUBLIC_CONFIG_TAG = "public-config";

const loadPublicConfig = unstable_cache(
  async () => {
    const supabase = createPublicClient();
    const [settings, flags, governorates, delegations, projectTypes, scenarios, options] = await Promise.all([
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
        .select("id, code, label_ar, description_ar")
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
    ]);

    for (const result of [settings, flags, governorates, delegations, projectTypes, scenarios, options]) {
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
    };
  },
  ["public-config-v2"],
  { tags: [PUBLIC_CONFIG_TAG], revalidate: 300 },
);

export type PublicConfig = Awaited<ReturnType<typeof loadPublicConfig>>;
export type OptionItem = PublicConfig["options"][number];
export type Governorate = PublicConfig["governorates"][number];
export type Delegation = PublicConfig["delegations"][number];
export type ProjectType = PublicConfig["projectTypes"][number];
export type OwnershipScenario = PublicConfig["scenarios"][number];

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

export function flagState(config: PublicConfig, key: string): FlagState {
  return config.flags[key] ?? "disabled";
}
