/**
 * Where this site answers from, as the outside world writes it.
 *
 * It is needed wherever an address has to be absolute and no request is in hand — the share card and the icons
 * in `generateMetadata`, which run while a page is being rendered ahead of time. Reading the host from the
 * request headers there, the way src/app/robots.ts and src/app/sitemap.ts do, would make every public page
 * dynamic and cost the home page its 60-second cache.
 *
 * The environment wins, so a preview deployment can describe itself; the fallback is the address the owner's
 * domain points at, the same one robots.ts and sitemap.ts fall back to.
 */
export const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://www.agrized.site";
