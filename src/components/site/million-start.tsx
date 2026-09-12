import Link from "next/link";

import { TreeCardBody, treeCardClass } from "@/components/site/tree-card";

type TreeOption = { id: string; code: string | null; label_ar: string; min_number: number | null };

type MillionStartProps = {
  treeCounts: TreeOption[];
  treesQuestion: string;
  /** `start.tier_taglines`, keyed by tree_count code; only the Arabic line is used here. */
  taglines: Record<string, { ar: string; fr?: string }>;
  /** «عدد آخر؟» text under the grid; hidden when the setting is empty. */
  otherLink: string;
};

/**
 * The tree question on the home page (MIL-01). Clicking a card is the next step: it opens /start
 * with that tier selected, where the rest of the choice happens.
 */
export function MillionStart({ treeCounts, treesQuestion, taglines, otherLink }: MillionStartProps) {
  return (
    <section id="start" className="scroll-mt-20 bg-forest text-paper">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="font-display text-3xl font-bold sm:text-4xl">{treesQuestion}</h2>
        <p className="mt-2 text-paper/75">اختيارك يمشي معك للخطوة الموالية. تنجم تبدّلو وقت اللي تحب.</p>

        <ul className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
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
        </ul>

        {otherLink ? (
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
