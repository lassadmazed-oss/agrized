// The Back Office's map of itself: the ten sections the owner named, in his order, and the pages that
// belong under each one.
//
// Nothing here imports @/lib/auth. That module is "server-only" and this one is read by the client nav
// and the client breadcrumb trail as well as by the server layout. Role gates and module flags are
// applied in src/app/admin/(panel)/layout.tsx, which is where the session and the feature flags are; a
// NavItem that reaches the client is already decided — plain, serializable data.
//
// The labels are Arabic staff copy written in code, the precedent admin-nav.tsx already set. Public
// user-facing copy still comes from `settings` through src/lib/config.ts and never from here.

// "parcels" stood here, with the plots-on-a-plan glyph beside it in nav-icons.tsx. Both went on 2026-09-19:
// the product sells numbered olive trees, no NavItem ever carried the key and /admin/projects/parcels answers
// 404. They had to go in one edit — SHAPES is typed Record<AdminIconKey, ReactNode>, so either half alone
// fails the build. The deferred keys below were always different: they wait for their module's table, they do
// not wait for a decision. "reservations" (the bookmark) and "visits" (the map pin) stopped waiting on
// 2026-09-19 and now carry real rows; "contracts", "payments" and "services" still do, and their glyphs stay
// drawn so restoring each one remains the single line this file promises.
export type AdminIconKey =
  | "dashboard"
  | "requests"
  | "analytics"
  | "offers"
  | "land"
  | "pricing"
  | "reservations"
  | "visits"
  | "contracts"
  | "payments"
  | "services"
  | "settings"
  | "modules"
  | "lists"
  | "media"
  | "users"
  | "audit";

/**
 * One row of the sidebar. `badge` and `off` are resolved from the module's flag state by the layout, so
 * a row that is not live never looks like one that is: the old nav was role-gated and nothing else, which
 * is why «عروض الأراضي» sat in the list looking exactly as open as «مطالب الاستثمار» whatever state its
 * module was in.
 */
export type NavItem = {
  href: string;
  label: string;
  icon: AdminIconKey;
  /** «معطّل» or «داخلي» when the module is not public. Undefined for a module that is open or has no flag. */
  badge?: string;
  /**
   * The module is switched off. The row is drawn quiet and says so, and it still opens: the Back Office is
   * where a module is prepared before it is published, and the five sections with no tables yet open onto
   * a page that states the domain is not open rather than onto a fabricated one. The flag governs what
   * visitors see, never who on the staff may reach their own workspace — that stays the role gate's job.
   */
  off?: boolean;
  children?: NavItem[];
};

export type NavGroup = { title?: string; items: NavItem[] };

/** What a row says about its module when the flag is not «public». */
export const NAV_STATE_LABELS = {
  internal: "داخلي",
  off: "معطّل",
} as const;

/**
 * Every Back Office path that has a name, in one place: the sidebar reads it for its rows and the
 * breadcrumb trail reads it for its crumbs, so a section is never named twice.
 *
 * ONE NAME PER SCREEN. The demand section was «الطلبات» here while its own <h1>, the back link on a file
 * and the audit log all said «مطالب الاستثمار» — the breadcrumb and the heading under it disagreed on the
 * same screen. The longer name wins because it is the one the rest of the product already prints, so the
 * five places agree without touching four other files.
 *
 * «العروض» is the client-facing offer — a piece of land and the numbered olive trees on it. The landowner
 * intake keeps its own name, «أراضٍ معروضة علينا», so the two stop colliding on the word عرض.
 *
 * A path named here does not have to be a nav row: /admin/settings/modules · lists · media are reached from
 * the strip at the top of /admin/settings, and the trail still names them on the way.
 */
export const ADMIN_LABELS = {
  "/admin": "لوحة القيادة",
  "/admin/leads": "مطالب الاستثمار",
  "/admin/analytics": "التحليلات وخريطة الطلب",
  "/admin/projects": "العروض",
  "/admin/land-offers": "أراضٍ معروضة علينا",
  "/admin/pricing": "التسعير",
  // «/admin/projects/parcels» → «القطع» was here until 2026-09-18. The route is deleted with the parcel
  // layer, so the crumb named a page that answers 404; the tree inventory is a tab on the offer itself
  // (/admin/projects/{id}), not a screen of its own, so no row replaces it.
  //
  // TWO OF THE FIVE COME BACK, 2026-09-19. الحجوزات · الزيارات · العقود · الدفوعات · الخدمات الفلاحية left on
  // 2026-08-18 because each of their pages said the same thing — the domain is not built yet — and five dead
  // ends cost a reader more than they tell them (owner: «I don't like the separated things»). The rule was
  // never «no rows», it was «no row without a table behind it»: الزيارات (public.visits) and الحجوزات
  // (public.reservations) now have one each, a screen that reads it, and acts a commercial can perform, so
  // they return under مطالب الاستثمار — the demand they continue. العقود · الدفوعات · الخدمات الفلاحية stay
  // out until stage 3 gives them theirs.
  //
  // The names are the ones their own screens print, which is the rule stated above: «الزيارات الميدانية» is
  // public.feature_flags.label_ar for `visits`, which that page reads for its own <h1>, and «الحجوزات
  // والعربون» is the <h1> of /admin/reservations. المطابقة has no row on purpose — it is not a destination,
  // it is a section on a client's file, and a nav row leading to a screen that does not exist is exactly the
  // dead end the five were removed for.
  "/admin/visits": "الزيارات الميدانية",
  "/admin/reservations": "الحجوزات والعربون",
  // STAGE 3, 2026-09-21 — العقود · الأقساط, the two the comment above left out until they had tables. They
  // do now (supabase/pending/bb_60_contracts_installments.sql) and two screens that read them, so the crumb
  // names them. These are LABELS, not nav rows: the rows live in admin/(panel)/layout.tsx, and without them
  // the trail on /admin/contracts would read «لوحة القيادة» and nothing else.
  "/admin/contracts": "العقود ووعد البيع",
  "/admin/installments": "الأقساط والخلاص",
  "/admin/settings": "الإعدادات",
  "/admin/settings/modules": "الموديولات",
  "/admin/settings/lists": "القوائم",
  "/admin/settings/media": "صور الموقع",
  "/admin/users": "المستخدمون",
  "/admin/audit": "سجل العمليات",
  "/admin/account": "كلمة السر",
} as const satisfies Record<string, string>;

export type AdminHref = keyof typeof ADMIN_LABELS;

export type Crumb = { href: string; label: string };

const LABEL: Record<string, string> = ADMIN_LABELS;

/**
 * The trail for a path: every named prefix of it, starting at the dashboard. A record's own page
 * (/admin/leads/<id>) contributes no crumb of its own — the layout does not know the record's name, and
 * the page's own <h1> already carries it — so the trail stops at the section it belongs to.
 */
export function trailFor(pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ href: "/admin", label: LABEL["/admin"] }];
  let prefix = "/admin";
  for (const segment of pathname.split("/").filter(Boolean).slice(1)) {
    prefix += `/${segment}`;
    const label = LABEL[prefix];
    if (label) crumbs.push({ href: prefix, label });
  }
  return crumbs;
}
