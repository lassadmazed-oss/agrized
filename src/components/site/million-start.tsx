import { ArrowLeft } from "lucide-react";
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
    <section id="start" className="scroll-mt-24 border-y border-line bg-cream">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="max-w-2xl">
          <h2 className="section-title">{treesQuestion}</h2>
          <p className="section-lead mt-3">اختيارك يمشي معك للخطوة الموالية. تنجم تبدّلو وقت اللي تحب.</p>
        </div>

        <ul className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {treeCounts.map((option) => (
            <li key={option.id}>
              <Link href={`/start?trees=${option.id}`} className={treeCardClass(false, "light")}>
                <TreeCardBody
                  labelAr={option.label_ar}
                  trees={option.min_number}
                  taglineAr={option.code ? taglines[option.code]?.ar : undefined}
                  tone="light"
                />
              </Link>
            </li>
          ))}
        </ul>

        {otherLink ? (
          <Link
            href="/start#custom"
            className="mt-7 inline-flex items-center gap-2 font-semibold text-forest underline-offset-4 hover:underline"
          >
            {otherLink}
            <ArrowLeft aria-hidden="true" className="size-4" />
          </Link>
        ) : null}
      </div>
    </section>
  );
}
