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

import type { AdminHref, AdminIconKey } from "./nav-model";

/** The cookie the switcher writes. Read by the layout; set only by the Server Action, never by a page. */
export const WORKSPACE_COOKIE = "agrized.workspace";

export type WorkspaceKey = "today" | "clients" | "field" | "grove" | "money" | "contracts" | "marketing" | "settings";

type WorkspaceShape = {
  key: WorkspaceKey;
  /** The door's own name, in Arabic. Staff copy, the precedent ./desk/desks.ts set. */
  label: string;
  /** The door's glyph in the sidebar and on the home page. */
  icon: AdminIconKey;
  /** The roles whose job this is. Admin and super_admin hold every door. */
  holders: readonly StaffRole[];
  /** The first screen behind the door. A reader who may not open it lands on the door's first row they may. */
  landing: AdminHref;
  /** Every row, in reading order. Each is gated by ITS OWN rule in panel-rows.ts and may not be drawn. */
  rows: readonly AdminHref[];
};

/*
 * THE DOORS, 2026-11-19. The owner: «نحب التجربة متاع اليتيليزاسيون في الباك اوفيس أسمح وأحلى وأسهل وأوضح»,
 * and «ابدا هكايا» on the proposal: eight doors named for what is behind them, in place of five workspaces one
 * of which held eleven rows. «اليوم» is everybody's first screen — what waits on you, then the doors. The
 * three screens about the same people (the calls desk, the demands, the owners' space) stand behind one door,
 * «الحرفاء»; the tablet, the hand-out, the calendar and «زياراتي» behind «الميدان». No route moved and no gate
 * changed: a row is still drawn only for a reader its own rule admits.
 */
export const WORKSPACES = [
  {
    key: "today",
    label: "اليوم",
    icon: "dashboard",
    holders: ["commercial", "agri_manager", "finance", "legal", "admin", "super_admin"],
    landing: "/admin",
    rows: ["/admin"],
  },
  {
    key: "clients",
    label: "الحرفاء",
    icon: "users",
    holders: ["commercial", "admin", "super_admin"],
    landing: "/admin/leads",
    rows: ["/admin/leads", "/admin/desk/calls", "/admin/reservations", "/admin/success", "/admin/persons", "/admin/v2"],
  },
  {
    key: "field",
    label: "الميدان",
    icon: "visits",
    holders: ["commercial", "admin", "super_admin"],
    landing: "/admin/terrain",
    rows: ["/admin/terrain", "/admin/terrain/assign", "/admin/visits", "/admin/desk/field"],
  },
  {
    key: "grove",
    label: "الضيعة",
    icon: "offers",
    // Finance is the offers' WRITER (projects/page.tsx WRITE_ROLES) and prices the trees: the door is theirs too.
    holders: ["agri_manager", "finance", "admin", "super_admin"],
    landing: "/admin/projects",
    rows: ["/admin/projects", "/admin/terrain/tasks", "/admin/agri", "/admin/harvest", "/admin/news", "/admin/land-offers"],
  },
  {
    key: "money",
    label: "الفلوس",
    icon: "payments",
    holders: ["finance", "admin", "super_admin"],
    landing: "/admin/installments",
    rows: ["/admin/installments", "/admin/reservations", "/admin/pricing", "/admin/subscriptions", "/admin/referrals"],
  },
  {
    key: "contracts",
    label: "العقود",
    icon: "contracts",
    holders: ["legal", "finance", "admin", "super_admin"],
    landing: "/admin/contracts",
    rows: ["/admin/contracts", "/admin/desk/legal", "/admin/desk/legal/partners", "/admin/desk/legal/checklist"],
  },
  {
    key: "marketing",
    label: "التسويق",
    icon: "notifications",
    holders: ["commercial", "admin", "super_admin"],
    landing: "/admin/marketing",
    rows: ["/admin/marketing", "/admin/notices", "/admin/notifications", "/admin/stories", "/admin/analytics"],
  },
  {
    key: "settings",
    label: "الإعدادات",
    icon: "settings",
    holders: ["admin", "super_admin"],
    landing: "/admin/settings",
    rows: [
      "/admin/settings",
      "/admin/users",
      "/admin/settings/modules",
      "/admin/settings/lists",
      "/admin/settings/media",
      "/admin/settings/translations",
      "/admin/settings/languages",
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
  if (held.some((workspace) => workspace.key === "today")) return "today";
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
  // 2026-11-19: a door is opened by its link, so the page you stand on decides first; the old switcher's
  // cookie only breaks a tie for a path no door claims.
  const byPath = workspaceForPath(held, pathname);
  if (byPath) return byPath;
  if (cookie && isWorkspaceKey(cookie) && held.some((workspace) => workspace.key === cookie)) return cookie;
  return primaryWorkspace(held);
}
