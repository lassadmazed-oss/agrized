import "server-only";

import { unstable_cache } from "next/cache";

import { createPublicClient } from "@/lib/supabase/public";

export type MillionProgress = {
  goal: number;
  treesRequested: number;
  treesReserved: number;
  treesContracted: number;
  treesPlanted: number;
  participants: number;
  requests: number;
  projectsUnderStudy: number;
};

/**
 * Counters for «مشروع المليون زيتونة» (MIL-01, spec v2 §6).
 *
 * Every figure is a count of real rows, and requested, reserved, contracted and planted trees are
 * never mixed. Returns null when the database cannot be reached or the public_statistics module is
 * not public (the RPC answers null to visitors then), so the section disappears rather than showing
 * a zero that would read as a statement about the project.
 */
const loadMillionProgress = unstable_cache(
  async (): Promise<MillionProgress | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("million_progress");
    if (error || !data || typeof data !== "object" || Array.isArray(data)) return null;

    const row = data as Record<string, unknown>;
    const count = (key: string) => Number(row[key] ?? 0) || 0;
    return {
      goal: count("goal"),
      treesRequested: count("trees_requested"),
      treesReserved: count("trees_reserved"),
      treesContracted: count("trees_contracted"),
      treesPlanted: count("trees_planted"),
      participants: count("participants"),
      requests: count("requests"),
      projectsUnderStudy: count("projects_under_study"),
    };
  },
  ["million-progress-v2"],
  { revalidate: 60 },
);

export function getMillionProgress(): Promise<MillionProgress | null> {
  return loadMillionProgress();
}
