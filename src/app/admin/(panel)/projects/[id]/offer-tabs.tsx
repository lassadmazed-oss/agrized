// The three sections of an offer: بيانات العرض / الزيتونات / التكاليف.
// Server component: the tab lives in the query string, so switching needs no client JavaScript and every tab
// has its own address that can be sent to a colleague.
//
// WHY THREE AND NOT FIVE (owner, 2026-09-18: «I do not like the separated things, it is too confusing»).
// The five were البطاقة / القطع / الصور / التسعير / التكاليف. القطع is gone with the lot layer — the offer's
// inventory is its trees. الصور and التسعير were each one block: a gallery, and a verdict line plus one
// checkbox form. Neither is a section of work on its own, and both answer the same question as البطاقة —
// «what is this offer and what does the visitor see» — so they are folded into it as headed sections, in view,
// not hidden behind a click. التكاليف stays apart because it is the one thing most readers may not see at all
// (PRJ-03, Finance and Admin): merging it upward would mean a tab that appears and disappears by role, and a
// commercial reading «بيانات العرض» would find half of it missing.
//
// An old link with ?tab=lots, ?tab=pricing or ?tab=pictures lands on بيانات العرض instead of failing, which is
// readOfferTab's existing fallback and needs no change.

import Link from "next/link";

import { formatCount } from "@/lib/format";

export type OfferTab = "card" | "trees" | "pricing" | "costs";

export const OFFER_TAB_LABELS: Record<OfferTab, string> = {
  card: "بيانات العرض",
  trees: "الزيتونات",
  pricing: "التسعير",
  costs: "التكاليف",
};

// التسعير comes back as a tab of the offer (owner, 2026-09-19: «each project offer should have its own pricing
// details, not from the /pricing page — all in the offer details page, each project has its own»). It sits
// between the inventory it prices and the costs that feed the price. /admin/pricing keeps only the general rule
// the /start calculator estimates with, which an offer inherits until it sets a value of its own.
const ORDER: OfferTab[] = ["card", "trees", "pricing", "costs"];

/** The tab asked for in ?tab=, or بيانات العرض. A tab the reader may not open falls back to it too. */
export function readOfferTab(value: string | string[] | undefined, allowed: readonly OfferTab[]): OfferTab {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as OfferTab) : "card";
}

export function OfferTabs({
  projectId,
  active,
  tabs,
  counts = {},
}: {
  projectId: string;
  active: OfferTab;
  /** The tabs this reader may open: التكاليف is Finance and Admin only (PRJ-03). */
  tabs: readonly OfferTab[];
  /** Shown beside a label, e.g. how many trees this offer holds. */
  counts?: Partial<Record<OfferTab, number>>;
}) {
  const shown = ORDER.filter((tab) => tabs.includes(tab));

  return (
    <nav aria-label="أقسام العرض" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex min-w-max gap-2">
        {shown.map((tab) => {
          const count = counts[tab];
          return (
            <li key={tab}>
              <Link
                href={`/admin/projects/${projectId}?tab=${tab}`}
                // "true", not "page": .chip in globals.css reads the selected state from [aria-current="true"],
                // so with "page" the open tab was the only one on the page that did not look open.
                aria-current={tab === active ? "true" : undefined}
                className="chip"
              >
                {OFFER_TAB_LABELS[tab]}
                {typeof count === "number" ? <span className="text-xs text-muted tabular-nums">{formatCount(count)}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
