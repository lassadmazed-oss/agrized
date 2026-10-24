"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { getPublicConfig } from "@/lib/config";
import { moduleAccess } from "@/lib/modules";
import { clientIp, hashIp } from "@/lib/request-context";
import { createClient } from "@/lib/supabase/server";

/*
 * «احسب مردودية مشروعك» — re-quoting a study while the visitor moves the sliders.
 *
 * NOTHING HERE COMPUTES ANYTHING, and that is the point. Every figure comes back from
 * public.public_project_study (0154), which is the one door onto the engine in 0153; the Back Office owns
 * each number it reads (0152). A screen that multiplied a yield by a price would be a second definition of
 * the study — one with no test behind it, drifting from the one that does — and §10 asks for the opposite:
 * «جميع الحسابات والنتائج قابلة للاختبار والمراجعة».
 *
 * THE REQUEST-SCOPED CLIENT, not a cached read, for the reason quoteOffer gives: a cache keyed on every
 * combination a visitor tries would mint an entry per keystroke and could answer with stale figures. The
 * caller's own JWT travels with it, so while the `study` module is «داخلي فقط» staff see the study on the
 * real site and a visitor sees «closed».
 */

const schema = z.object({
  projectId: z.uuid(),
  trees: z.number().int().min(1).max(100_000),
  years: z.number().int().min(1).max(60),
  scenario: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/).nullable(),
  mode: z.enum(["olives", "oil"]),
  paymentMode: z.enum(["cash", "installments"]).nullable(),
  downPercentOptionId: z.uuid().nullable(),
  durationOptionId: z.uuid().nullable(),
});

export type StudyInput = z.input<typeof schema>;

/** One row of the year-by-year table §4 asks to draw. Year 0 is the signature: money out, no season. */
export type StudyRow = {
  year: number;
  age: number;
  kg_per_tree: number;
  kg_total: number;
  litres: number;
  revenue_millimes: number;
  charges_millimes: number;
  finance_millimes: number;
  net_millimes: number;
  cumulative_millimes: number;
};

export type Study =
  | { status: "closed" }
  | { status: "incomplete"; missing: string[]; legal_note: string }
  | {
      status: "ok";
      project_code: string;
      project_name: string;
      trees: number;
      tree_age_years: number;
      years: number;
      mode: "olives" | "oil";
      scenario: { code: string; label_ar: string };
      scenarios: { code: string; label_ar: string }[];
      investment: {
        price_per_tree_millimes: number;
        total_price_millimes: number;
        payment_mode: "cash" | "installments";
        down_payment_millimes: number;
        monthly_millimes: number;
        duration_months: number;
        invested_millimes: number;
      };
      rows: StudyRow[];
      totals: {
        revenue_millimes: number;
        charges_millimes: number;
        net_millimes: number;
        cumulative_millimes: number;
        payback_year: number | null;
        roi_bp: number | null;
        yearly_bp: number | null;
      };
      legal_note: string;
    };

/**
 * THE ONE CAST IN THIS MODULE. public.public_project_study arrives with 0154 and `npm run db:types` has not
 * seen it — the project's Supabase token expired on 2026-10-11 — so the generated Database type does not
 * carry the name. Named once, here. Delete it when the token is renewed and the types are regenerated.
 */
type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/** The study for these answers, or null — which every caller reads as «keep the figures you have». */
export async function quoteStudy(input: StudyInput): Promise<Study | null> {
  const config = await getPublicConfig();
  if ((await moduleAccess(config, "study")) === "closed") return { status: "closed" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return null;
  const data = parsed.data;

  try {
    const supabase = await createClient();
    const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
    const { data: row, error } = await rpc("public_project_study", {
      p_project: data.projectId,
      p_trees: data.trees,
      p_years: data.years,
      p_scenario: data.scenario ?? undefined,
      p_mode: data.mode,
      p_payment: data.paymentMode ?? undefined,
      p_down: data.downPercentOptionId ?? undefined,
      p_duration: data.durationOptionId ?? undefined,
    });
    if (error) {
      console.error("public_project_study failed", error.message);
      return null;
    }
    if (!row || typeof row !== "object") return null;
    return row as Study;
  } catch {
    return null;
  }
}

/**
 * §8's three buttons all press this first: the study is recorded, and the reader is given a reference he
 * can read down the phone so a commercial opens the same figures.
 *
 * IT SENDS THE ANSWERS, NEVER THE RESULTS. public.save_study runs the engine itself and stores what IT
 * produced — a function that filed what this page handed it would let anyone save a study with AgriZed's
 * name on a 400% return. Nothing on screen is trusted; only the question is sent.
 *
 * A FAILURE HERE IS NOT A FAILURE OF THE PAGE. The figures the reader is looking at are already correct and
 * already printable, so this answers null and the screen says so quietly rather than taking the buttons
 * away. The ip hash is the same one every other anonymous write on this site uses — enough to stop a
 * hundred rows from one tap, not enough to identify anybody.
 */
export async function saveStudy(input: StudyInput): Promise<{ id: string; reference: string } | null> {
  const config = await getPublicConfig();
  if ((await moduleAccess(config, "study")) === "closed") return null;

  const parsed = schema.safeParse(input);
  if (!parsed.success) return null;
  const data = parsed.data;

  try {
    const supabase = await createClient();
    const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
    const { data: row, error } = await rpc("save_study", {
      p_project: data.projectId,
      p_trees: data.trees,
      p_years: data.years,
      p_scenario: data.scenario ?? undefined,
      p_mode: data.mode,
      p_payment: data.paymentMode ?? undefined,
      p_down: data.downPercentOptionId ?? undefined,
      p_duration: data.durationOptionId ?? undefined,
      p_ip_hash: hashIp(clientIp(await headers())),
    });
    if (error || !row || typeof row !== "object") {
      if (error) console.error("save_study failed", error.message);
      return null;
    }
    const saved = row as { id?: unknown; reference_no?: unknown };
    if (typeof saved.id !== "string" || typeof saved.reference_no !== "string") return null;
    return { id: saved.id, reference: saved.reference_no };
  } catch {
    return null;
  }
}
