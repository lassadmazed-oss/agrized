import "server-only";

import { unstable_cache } from "next/cache";

import { createPublicClient } from "@/lib/supabase/public";

export type MillionProgress = {
  goal: number;
  treesRequested: number;
  participants: number;
  requests: number;
  projectsUnderStudy: number;
};

/**
 * Counters for «مشروع المليون زيتونة» (MIL-01).
 *
 * Every figure is a count of real rows. Returns null when the database cannot be reached, so the
 * section disappears rather than showing a zero that would read as a statement about the project.
 */
const loadMillionProgress = unstable_cache(
  async (): Promise<MillionProgress | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("million_progress");
    if (error || !data || typeof data !== "object") return null;

    const row = data as Record<string, number>;
    return {
      goal: Number(row.goal ?? 0),
      treesRequested: Number(row.trees_requested ?? 0),
      participants: Number(row.participants ?? 0),
      requests: Number(row.requests ?? 0),
      projectsUnderStudy: Number(row.projects_under_study ?? 0),
    };
  },
  ["million-progress-v1"],
  { revalidate: 60 },
);

export function getMillionProgress(): Promise<MillionProgress | null> {
  return loadMillionProgress();
}
