import { settingJson, t, type PublicConfig } from "@/lib/config";

/**
 * Every word of the journey sections, read from `settings` in the page's language (0127).
 *
 * This file used to HOLD the words — it was the prototype's copy module, and the owner has since asked for
 * them where he can reach them («ركّبهم في الصفحة الرئيسية مع النصوص في الإعدادات وبالخمس لغات»). It is now
 * the one place that reads them, so no section has to know a key.
 *
 * THE FOUR LISTS ARRIVE ALREADY TRANSLATED. `settingJson` reads the value config.ts resolved for this
 * request's language: for a json array, settingValue() takes the whole translated array from
 * public.translations, so a French page gets the French list and never a row-by-row mixture. An empty list is
 * a section that draws nothing — which is the right behaviour for a setting the owner has emptied, and the
 * reason every consumer checks for it rather than assuming eleven scenes.
 *
 * `key` and `icon` are NOT words. The code looks its drawings up by them (SCENE_VIEWS, GLYPHS), the migration
 * says so on the row, and 077_journey.sql fails the build if a translated list changes one.
 */

export type Scene = { key: string; title: string; line: string };
export type Step = { key: string; label: string };
export type TrustItem = { key: string; icon: string; q: string; a: string };
export type ExampleStep = { key: string; label: string; detail: string };

export type JourneyCopy = ReturnType<typeof journeyCopy>;
/** The words the player needs in the browser. Kept apart so only these cross to the client. */
export type DemoCopy = JourneyCopy["demo"];

export function journeyCopy(config: PublicConfig) {
  return {
    scenes: settingJson<Scene[]>(config, "site.journey_scenes", []),
    steps: settingJson<Step[]>(config, "site.journey_steps", []),
    trust: settingJson<TrustItem[]>(config, "site.journey_trust", []),
    example: settingJson<ExampleStep[]>(config, "site.journey_example", []),

    demo: {
      eyebrow: t(config, "ui.journey.eyebrow"),
      title: t(config, "ui.journey.title"),
      lead: t(config, "ui.journey.lead"),
      ctaPrimary: t(config, "ui.journey.cta_primary"),
      ctaOffers: t(config, "ui.journey.cta_offers"),
      play: t(config, "ui.journey.play"),
      pause: t(config, "ui.journey.pause"),
      next: t(config, "ui.journey.next"),
      previous: t(config, "ui.journey.previous"),
      // Carries {step} and {total}; the player fills them, so it travels as its template.
      stepOf: t(config, "ui.journey.step_of"),
      progressLabel: t(config, "ui.journey.progress_label"),
    },

    howTitle: t(config, "ui.journey.how_title"),

    trustTitle: t(config, "ui.journey.trust_title"),
    trustLead: t(config, "ui.journey.trust_lead"),

    offers: {
      title: t(config, "ui.journey.offers_title"),
      lead: t(config, "ui.journey.offers_lead"),
      all: t(config, "ui.journey.offers_all"),
      /** Carries {count}; filled where the figure is known. */
      available: t(config, "ui.journey.offers_available"),
      cta: t(config, "ui.journey.offers_cta"),
      priceSuffix: t(config, "ui.journey.offers_price_suffix"),
      factTrees: t(config, "ui.journey.fact_trees"),
      factArea: t(config, "ui.journey.fact_area"),
      factVariety: t(config, "ui.journey.fact_variety"),
      factAreaPerTree: t(config, "ui.journey.fact_area_per_tree"),
      factAge: t(config, "ui.journey.fact_age"),
      /** Carries {count}. */
      factAgeValue: t(config, "ui.journey.fact_age_value"),
      legendReal: t(config, "ui.journey.legend_real"),
      legendRealNote: t(config, "ui.journey.legend_real_note"),
      legendEstimate: t(config, "ui.journey.legend_estimate"),
      legendEstimateNote: t(config, "ui.journey.legend_estimate_note"),
    },

    exampleCopy: {
      eyebrow: t(config, "ui.journey.example_eyebrow"),
      title: t(config, "ui.journey.example_title"),
      lead: t(config, "ui.journey.example_lead"),
      note: t(config, "ui.journey.example_note"),
      cta: t(config, "ui.journey.example_cta"),
    },
  };
}
