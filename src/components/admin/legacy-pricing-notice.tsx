import Link from "next/link";

import type { PublicConfig } from "@/lib/config";

/**
 * True once the tree pricing exists (docs/tree-area-and-cost.md): its migration seeds the `pricing` flag and
 * agrized-db's /admin/pricing page edits it. Until then the notice and its link stay hidden, so no link leads nowhere.
 */
export function treePricingReady(config: PublicConfig): boolean {
  return Object.hasOwn(config.flags, "pricing");
}

/**
 * On the jsonb pricing editors (project, parcel, pricing.default): since financing_markups became the single
 * source of the markup per duration, those formulas only price the parcels still on the legacy path.
 */
export function LegacyPricingNotice({ href = "/admin/pricing" }: { href?: string }) {
  return (
    <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
      هذا التسعير القديم للقطع الحالية فقط. التسعير الجديد (المساحة، التكاليف، الهامش، الزيادة حسب المدة) في{" "}
      <Link href={href} className="font-semibold underline underline-offset-4">
        صفحة التسعير
      </Link>
      .
    </p>
  );
}
