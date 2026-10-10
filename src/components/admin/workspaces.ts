// مساحات العمل — the Back Office drawn one job at a time.
//
// The owner, 2026-09-28: «تحب تنظيم الباك أند أسهل ومنفصل أكثر في design interface، كل واحد بالتاش متاعه».
// Until now the panel built ONE sidebar for everybody and hid rows by role, so a commercial opened it onto a
// list in which most rows were somebody else's work — the exact complaint the desks (./desk/desks.ts) answered
// for the LANDING and this file now answers for the SIDEBAR. A workspace is one job's rows, in the order that
// job reads them, with that job's queue as the first screen. A reader who holds one workspace sees only it and
// no switcher; a reader who holds several — and admin/super_admin hold all five — gets a small switcher and is
// never shown two jobs at once.
//
// NO ROUTE MOVES AND NO GATE CHANGES. This is purely what is drawn and where you land. Every requireStaff() call
// stays where it is, and whether a ROW is drawn is still decided by the row's own gate — CRM_READ_ROLES,
// PRICE_ROLES, LAND_OFFER_ROLES, ADMIN_ROLES, CALL_DESK_ROLES, LEGAL_DESK_ROLES, AGRI_ROLES — applied in
// src/app/admin/(panel)/layout.tsx, which is where the session and the flags are. `holders` below is a
// different question: not «may this reader open /admin/pricing» but «is المالية one of this reader's jobs».
// The two can disagree on purpose. Finance is inside CRM_READ_ROLES and may open every client file, yet
// المبيعات is not Finance's job, so it is not their workspace; the file is still one link away when they
// need it, and the database answers the same either way.
//
// WHY THE ROLE NAMES ARE WRITTEN OUT HERE AND NOT IMPORTED. src/lib/auth.ts is "server-only" and this module
// is read by the client-side switcher (it needs the pathname, which only a client component can know), so a
// value import from it would break the client bundle; `import type` is erased and is fine. The lists below
// are therefore structure — who holds which door — and deliberately NOT a fifteenth copy of a role gate (see
// ./desk/desks.ts on why copies are a known problem): nothing here grants or refuses anything.
//
// The workspace NAMES live here as constants rather than in ADMIN_LABELS because they are not the name of a
// screen: no route prints «المبيعات» as its <h1>, and the breadcrumb must never offer it as a crumb. They are
// structure, like the desks' labels in ./desk/desks.ts, and they follow that precedent.

import type { StaffRole } from "@/lib/auth";

import type { AdminHref } from "./nav-model";

/** The cookie the switcher writes. Read by the layout; set only by the Server Action, never by a page. */
export const WORKSPACE_COOKIE = "agrized.workspace";

export type WorkspaceKey = "sales" | "grove" | "finance" | "legal" | "admin";

type WorkspaceShape = {
  key: WorkspaceKey;
  /** The job's own name, in Arabic. Staff copy, the precedent ./desk/desks.ts set. */
  label: string;
  /** The roles whose job this is. Admin and super_admin hold every workspace. */
  holders: readonly StaffRole[];
  /** The first screen of the job — its queue, not a dashboard. */
  landing: AdminHref;
  /** Every row, in reading order. Each is gated by ITS OWN rule in layout.tsx and may not be drawn. */
  rows: readonly AdminHref[];
};

/**
 * The five workspaces, in the order the switcher draws them and the order `primaryWorkspace` prefers them.
 *
 * Some rows sit in two workspaces on purpose. الحجوزات والعربون is the commercial's hold AND the dinar Finance
 * is waiting for; العقود ووعد البيع is what Legal signs AND what Finance collects against. A row belongs to
 * every job that works it, and a reader who holds both sees it in both — the alternative is sending Finance
 * into المبيعات to find their own money.
 *
 * /admin/v2 is the other session's sale-flow UI («مسار البيع»). It is linked, not touched: the row is a door
 * to it and nothing under src/app/admin/v2 is this file's to describe.
 */
export const WORKSPACES = [
  {
    key: "sales",
    label: "المبيعات",
    holders: ["commercial", "admin", "super_admin"],
    landing: "/admin/desk/calls",
    rows: [
      "/admin/desk/calls",
      "/admin/desk/field",
      "/admin/leads",
      "/admin/persons",
      "/admin/visits",
      "/admin/reservations",
      "/admin/analytics",
      "/admin/v2",
    ],
  },
  {
    key: "grove",
    label: "الضيعة",
    // Finance holds الضيعة too, and not as a courtesy: Finance is the offers' WRITER (projects/page.tsx
    // WRITE_ROLES), sits in AGRI_ROLES and in LAND_OFFER_ROLES, and prices the trees. A finance session
    // with no sidebar path to /admin/projects would have lost the screen it builds offers on — the review
    // of this file found exactly that regression against the old navFor.
    holders: ["agri_manager", "finance", "admin", "super_admin"],
    landing: "/admin/projects",
    rows: ["/admin/projects", "/admin/agri", "/admin/harvest", "/admin/land-offers"],
  },
  {
    key: "finance",
    label: "المالية",
    holders: ["finance", "admin", "super_admin"],
    landing: "/admin/installments",
    rows: [
      "/admin/installments",
      "/admin/contracts",
      "/admin/reservations",
      "/admin/pricing",
      "/admin/subscriptions",
      "/admin/referrals",
    ],
  },
  {
    key: "legal",
    label: "القانوني",
    holders: ["legal", "admin", "super_admin"],
    landing: "/admin/desk/legal",
    rows: ["/admin/desk/legal", "/admin/contracts", "/admin/desk/legal/partners", "/admin/desk/legal/checklist"],
  },
  {
    key: "admin",
    label: "الإدارة",
    holders: ["admin", "super_admin"],
    landing: "/admin",
    rows: [
      "/admin",
      "/admin/settings",
      "/admin/settings/modules",
      "/admin/settings/lists",
      "/admin/settings/media",
      "/admin/settings/translations",
      "/admin/settings/languages",
      "/admin/users",
      "/admin/audit",
    ],
  },
] as const satisfies readonly WorkspaceShape[];

export type Workspace = (typeof WORKSPACES)[number];

/** Every href that is a row of some workspace. The layout's rule table is keyed on it, so a row without a gate rule fails the build. */
export type WorkspaceRow = Workspace["rows"][number];

export function isWorkspaceKey(value: unknown): value is WorkspaceKey {
  return WORKSPACES.some((workspace) => workspace.key === value);
}

/** The workspaces this session holds, in the order above. Never empty for a staff session: every staff role holds one. */
export function heldWorkspaces(roles: readonly StaffRole[]): Workspace[] {
  return WORKSPACES.filter((workspace) => workspace.holders.some((role) => roles.includes(role)));
}

/** What `resolveWorkspace` needs to know about a held workspace: which it is, and which paths it covers. */
export type HeldWorkspace = { key: WorkspaceKey; rows: readonly string[] };

/**
 * The workspace a session starts in when nothing else says otherwise: the first it holds, in the order of
 * WORKSPACES — except that a reader who holds الإدارة starts there. Admin and super_admin hold all five, so
 * «first held» would put every admin into المبيعات, and the admin's own job is the dashboard and the rules,
 * not the phones.
 */
export function primaryWorkspace(held: readonly HeldWorkspace[]): WorkspaceKey | null {
  if (held.some((workspace) => workspace.key === "admin")) return "admin";
  return held[0]?.key ?? null;
}

/**
 * The workspace whose rows contain the current path. The rule is the sidebar's own (admin-nav.tsx): a row owns
 * its subtree, /admin owns only itself, and the LONGEST owning row wins — so /admin/desk/legal/partners resolves
 * to القانوني through /admin/desk/legal and never to الإدارة through /admin. A row that sits in two workspaces
 * (الحجوزات, العقود) resolves to the first held in WORKSPACES order, which is a tie and not a wrong answer: both
 * workspaces will draw the row lit.
 */
export function workspaceForPath(held: readonly HeldWorkspace[], pathname: string): WorkspaceKey | null {
  const covers = (href: string) => (href === "/admin" ? pathname === "/admin" : pathname === href || pathname.startsWith(`${href}/`));
  let best: { key: WorkspaceKey; href: string } | null = null;
  for (const workspace of held) {
    for (const href of workspace.rows) {
      if (covers(href) && (!best || href.length > best.href.length)) best = { key: workspace.key, href };
    }
  }
  return best?.key ?? null;
}

/**
 * Which workspace is drawn, in this order:
 *
 *   1. the cookie, if it names a workspace this session holds — the reader chose it, and a choice made with a
 *      click outranks anything inferred. A cookie naming a workspace the session no longer holds (a role was
 *      taken away) is ignored rather than trusted, because the sidebar it names would be empty;
 *   2. else the workspace whose rows contain the current path — a reader arriving by URL, breadcrumb or a link
 *      from the dashboard is standing in that job already, and the sidebar should agree with the page;
 *   3. else the session's primary workspace.
 *
 * The pathname is only known on the client (a server layout receives none), which is why this function is
 * pure and is called from the switcher component with usePathname(), and why this module imports nothing
 * "server-only".
 */
export function resolveWorkspace(
  held: readonly HeldWorkspace[],
  { cookie, pathname }: { cookie: string | null; pathname: string },
): WorkspaceKey | null {
  if (cookie && isWorkspaceKey(cookie) && held.some((workspace) => workspace.key === cookie)) return cookie;
  return workspaceForPath(held, pathname) ?? primaryWorkspace(held);
}
