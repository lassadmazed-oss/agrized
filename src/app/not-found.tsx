import type { Metadata } from "next";

import { NotFoundView } from "@/components/site/not-found-view";

export const metadata: Metadata = {
  title: "الصفحة ما لقيناهاش",
  robots: { index: false, follow: false },
};

/**
 * The root boundary: every address that matches no route at all, and notFound() thrown anywhere with no nearer
 * not-found.tsx — the Back Office included. It renders inside the root layout, so it has the Arabic fonts and
 * the right-to-left document; what it does not have is the public header and footer, which is why the view
 * below carries its own way back. The public side has its own boundary, inside the site shell.
 */
export default function NotFound() {
  return <NotFoundView />;
}
