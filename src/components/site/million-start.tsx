import Link from "next/link";

import { TreeCardBody, treeCardClass } from "@/components/site/tree-card";

type TreeOption = { id: string; code: string | null; label_ar: string; min_number: number | null };

type MillionStartProps = {
  treeCounts: TreeOption[];
  treesQuestion: string;
  /** Line under the question; hidden when the setting is empty. */
  subtitle: string;
  /** `start.tier_taglines`, keyed by tree_count code ("custom" for the free number); only the Arabic line is used here. */
  taglines: Record<string, { ar: string; fr?: string }>;
  /** «عدد آخر» card closing the row (spec v2 §7); hidden when the setting is empty. */
  otherCardLabel: string;
  /** «عدد آخر؟» text under the grid, shown only when the card is hidden so the same choice is not offered twice. */
  otherLink: string;
};

/**
 * The tree question on the home page (MIL-01). Clicking a card is the next step: it opens /start
 * with that tier selected, or on the free-number field for «عدد آخر», where the rest of the choice happens.
 */
export function MillionStart({ treeCounts, treesQuestion, subtitle, taglines, otherCardLabel, otherLink }: MillionStartProps) {
  return (
    // No `id` and no scroll margin: this section carried id="start" and nothing in the site, the header,
    // the footer or a message template ever linked it — the last unlinked landmark on the home page, and an
    // anchor that answers nothing is a promise the page cannot keep. 2026-09-19.
    <section className="bg-forest text-paper">
      <div className="mx-auto max-w-6xl px-4 py-section sm:px-6">
        <h2 className="section-title text-paper">{treesQuestion}</h2>
        {subtitle ? <p className="mt-2 text-paper/75">{subtitle}</p> : null}

        <ul className="mt-roomy grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {treeCounts.map((option) => (
            <li key={option.id}>
              <Link href={`/start?trees=${option.id}`} className={treeCardClass(false, "dark")}>
                <TreeCardBody
                  labelAr={option.label_ar}
                  trees={option.min_number}
                  taglineAr={option.code ? taglines[option.code]?.ar : undefined}
                  tone="dark"
                />
              </Link>
            </li>
          ))}
          {otherCardLabel ? (
            <li>
              <Link href="/start#custom" className={treeCardClass(false, "dark")}>
                <TreeCardBody labelAr={otherCardLabel} taglineAr={taglines.custom?.ar} tone="dark" />
              </Link>
            </li>
          ) : null}
        </ul>

        {!otherCardLabel && otherLink ? (
          <Link
            href="/start#custom"
            className="mt-6 inline-block font-semibold text-gold-bright underline-offset-4 hover:underline"
          >
            {otherLink}
          </Link>
        ) : null}
      </div>
    </section>
  );
}
