import type { Metadata } from "next";

import { NotFoundView } from "@/components/site/not-found-view";

export const metadata: Metadata = {
  title: "الصفحة ما لقيناهاش",
  robots: { index: false, follow: false },
};

/**
 * The public side's own boundary, so a dead offer code — projects/[code] and its parcel page both throw
 * notFound() — keeps the header, the footer and the way back to «عروضنا» instead of dropping the visitor onto a
 * bare page. Same view as the root one; only the shell around it differs.
 */
export default function PublicNotFound() {
  return <NotFoundView />;
}
