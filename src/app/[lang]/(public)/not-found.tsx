import type { Metadata } from "next";

import { NotFoundView } from "@/components/site/not-found-view";
import { getPublicConfig, t } from "@/lib/config";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getPublicConfig();
  return {
    title: t(config, "ui.pages.not_found_meta_title"),
    robots: { index: false, follow: false },
  };
}

/**
 * The public side's own boundary, so a dead offer code — projects/[code] and its parcel page both throw
 * notFound() — keeps the header, the footer and the way back to «عروضنا» instead of dropping the visitor onto a
 * bare page. Same view as the root one; only the shell around it differs.
 */
export default function PublicNotFound() {
  return <NotFoundView />;
}
