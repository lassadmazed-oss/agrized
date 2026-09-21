// Modules that exist in this version of the code. The Back Office refuses to publish the others.
//
// A key in this list is the ONLY thing that draws the three-state control on /admin/settings/modules; a key
// missing from it renders «يُبنى في دفعة قادمة» and no control at all, so the owner physically cannot switch
// that module on however finished it is. Being listed here publishes nothing: every one of these rows keeps
// whatever state public.feature_flags holds, and only the owner's own press changes it.
//
// WHAT EACH MODULE DOES is not written here. It is public.feature_flags.description_ar — one row per module,
// editable, printed under the module's name on that screen — so a module's description and its state are the
// same record and cannot drift apart. The three added below carry their new description in their own SQL
// draft, which is also what rewrites the old «البند 8.3 / 12 / 13» lines that named the v1 numbering.
//
// STAGE 2, 2026-09-19 — matching · visits · reservations (report v3 §43/§45, §25, §23/§24). Each one is a
// Back Office module: «داخلي فقط» is enough for the team to work with it, and none of the three has a public
// surface yet. Each needs its table before its screens can do anything, so the order is: apply the draft
// (supabase/pending/bb_22_matching.sql · bb_21_visits.sql · bb_20_reservations.sql), then press the switch.
// Until the draft is applied the module's screens say so in one line instead of failing.
export const IMPLEMENTED_MODULES = [
  "interest_form",
  "simulator_basic",
  "land_offers",
  "projects",
  "public_statistics",
  "pricing",
  "matching",
  "visits",
  "reservations",
  // STAGE 4, 2026-09-21 — the four that live after someone owns trees. Their tables are applied
  // (0066_agri_services · 0067_harvest · 0068_zitounti), their screens exist, and their descriptions are
  // already written in feature_flags. They were missing from THIS list, which is the one that decides whether
  // the switch is drawn at all — so the owner was reading a finished module's description above the words
  // «يُبنى في دفعة قادمة» and no control, with no way to turn on what was waiting for him.
  "agri_backoffice",
  "subscriptions",
  "harvest",
  "zitounti",
] as const;

export const FLAG_STATE_LABELS = {
  disabled: "معطّل",
  internal: "داخلي فقط",
  public: "منشور للعموم",
} as const;

export const PHASE_LABELS: Record<number, string> = {
  1: "المرحلة 1 · جمع الطلب",
  2: "المرحلة 2 · المشاريع والحجز",
  3: "المرحلة 3 · التعاقد والأقساط",
  4: "المرحلة 4 · ما بعد التملّك",
};

export function isImplementedModule(key: string): boolean {
  return (IMPLEMENTED_MODULES as readonly string[]).includes(key);
}
