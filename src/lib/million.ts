import "server-only";

import { unstable_cache } from "next/cache";

import { createPublicClient } from "@/lib/supabase/public";

/**
 * Every figure the counter can report, and `null` for one `public.million_progress()` did not answer with.
 *
 * A missing figure is NOT a zero. `MillionCounter` hides a tile it was given no figure for, and that hiding
 * is only reachable if the absence survives this reader — `Number(undefined ?? 0) || 0` used to turn every
 * absent key into a confident 0, so a figure the database stopped reporting would have been printed as a
 * statement about the project («0 زيتونة محجوزة») instead of disappearing. 2026-09-19.
 *
 * `requests` stood here until 2026-09-19: the RPC still returns it and no component has ever rendered it.
 */
export type MillionProgress = {
  goal: number | null;
  treesRequested: number | null;
  treesReserved: number | null;
  treesContracted: number | null;
  treesPlanted: number | null;
  participants: number | null;
  projectsUnderStudy: number | null;
  /** The land behind the offers a visitor can see, in square metres (migration 0071). Null before it lands. */
  areaOfferedM2: number | null;
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
    // A key the counter did not answer with — or answered with something that is not a number — is absent,
    // not zero. A real 0 stays a 0: it is a count, and beside a stage that has moved it says how far it came.
    const count = (key: string): number | null => {
      const raw = row[key];
      if (raw === undefined || raw === null) return null;
      const value = Number(raw);
      return Number.isFinite(value) ? value : null;
    };
    return {
      goal: count("goal"),
      treesRequested: count("trees_requested"),
      treesReserved: count("trees_reserved"),
      treesContracted: count("trees_contracted"),
      treesPlanted: count("trees_planted"),
      participants: count("participants"),
      projectsUnderStudy: count("projects_under_study"),
      areaOfferedM2: count("area_offered_m2"),
    };
  },
  ["million-progress-v2"],
  { revalidate: 60 },
);

export function getMillionProgress(): Promise<MillionProgress | null> {
  return loadMillionProgress();
}
