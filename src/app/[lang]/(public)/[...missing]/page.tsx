import { notFound } from "next/navigation";

/**
 * Every address under a language that matches no page (0109). Since the site lives under `[lang]`, an unknown
 * path like `/fr/nothing` would otherwise fall past the site's shell to the global 404; throwing here instead
 * renders ../not-found.tsx inside the public layout — header, footer and the visitor's own language.
 */
export default function MissingPage() {
  notFound();
}
