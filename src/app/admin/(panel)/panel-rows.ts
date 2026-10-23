// The Back Office's rows, in one place, because two screens now draw them.
//
// ROW_RULES and the builder under it were private to layout.tsx while the sidebar was the only thing that
// read them. صفحة البداية (./page.tsx) draws the same sections as a grid of squares, and the one thing it
// must not do is decide for itself who may see what: a second copy of these gates is a second place for
// them to drift, and the drift would be a reader looking at a tile for a screen that refuses them.
//
// So the rules move here and both callers read them. Nothing about who sees what changes — every rule below
// is the one the section always had, and the real gate is still the requireStaff() inside each route.

import { ADMIN_LABELS, NAV_STATE_LABELS, type AdminIconKey, type NavItem } from "@/components/admin/nav-model";
import { heldWorkspaces, type WorkspaceRow } from "@/components/admin/workspaces";
import {
  ADMIN_ROLES,
  CRM_READ_ROLES,
  hasRole,
  LAND_OFFER_ROLES,
  PRICE_ROLES,
  type StaffRole,
  type StaffSession,
} from "@/lib/auth";
import { flagState, type PublicConfig } from "@/lib/config";

import { AGRI_ROLES } from "./agri/agri-model";
import { CALL_DESK_ROLES } from "./desk/desks";
import { LEGAL_DESK_ROLES } from "./desk/legal/roles";

/** One workspace with the rows this reader may actually open. */
export type RowGroup = { key: string; label: string; items: NavItem[] };

type RowRule = {
  icon: AdminIconKey;
  /** The role gate, unchanged from the one this section always had. */
  roles?: readonly StaffRole[];
  /** The key in feature_flags. A section with no module of its own passes none. */
  flag?: string;
};

/**
 * What decides a row, one rule per destination. WHICH workspace a row belongs to, and in what order, is
 * structure and lives in src/components/admin/workspaces.ts; WHETHER this session sees it is decided here,
 * where the session and the flags are. The table is keyed on every workspace row, so a row added over there
 * without a rule here fails the build instead of silently drawing ungated.
 *
 * Two things decide a row. The role gate is the one the section always had — CRM_READ_ROLES on the demand
 * side, LAND_OFFER_ROLES on the landowner intake, PRICE_ROLES on pricing, ADMIN_ROLES on administration,
 * CALL_DESK_ROLES · LEGAL_DESK_ROLES · AGRI_ROLES on the desks and the grove — and nothing here widens or
 * narrows one. Each row carries the gate ITS OWN routes apply, so the sidebar and the page can never disagree
 * about who may enter. A workspace only says whose JOB a row is; a row a reader may not open is not drawn even
 * inside a workspace they hold (a commercial holds المبيعات and does not see /admin/pricing there — it is
 * not there to see).
 *
 * The module flag: each row carries its module's state — «معطّل», «داخلي» — and is drawn quiet when it is
 * off, so a row never looks more live than its module is. A row that is off STILL OPENS. The flag says what
 * visitors see; it is not an access rule for the staff, and the Back Office is precisely where a module is
 * prepared before it is published — gating the link on it would lock Finance out of the instalments and
 * contracts modules while they are still «معطّل» and being set up. What a switched-off row must never do is lead to an invented screen, and none of them do: every
 * flagged page here says which state its module is in and which switch changes it, and the two whose tables
 * were once a draft (العقود · الأقساط) answer a missing function as its own case, naming the file. That is the
 * one condition under which a row is honest — it leads somewhere that tells the truth — and it is the
 * condition the five rows removed on 2026-09-18 had failed («a row that leads nowhere costs a reader more
 * than it tells them»). The four rows the workspaces add — زيتونتي · العمليات الفلاحية · الصابة والجني ·
 * الاشتراكات — meet it: each has its tables (0067, 0068 and their neighbours) and a screen that reads them,
 * and each carries the flag its own page reads. The desks carry no flag: they are how the team works, not a
 * module the owner publishes, and there is no visitor-facing door to open or close.
 *
 * Nothing nests any more. The old sidebar nested rows by what they belonged to (the analysis under the demand,
 * the rate card under the offers it prices) because it had to hold four jobs at once; a workspace holds one,
 * and inside one job a flat list in reading order is the whole hierarchy. Two of the old decisions survive
 * that flattening in a new shape. التسعير is in المالية and not in الإدارة with the other rules, because it
 * is Finance's screen (PRICE_ROLES) and الإدارة is Admin's — nesting it there would take the rate card away
 * from the only people who set it. الموديولات · القوائم · صور الموقع, folded into the strip on /admin/settings
 * on 2026-09-19 because three of eleven rows for one room was too many, are rows again inside الإدارة, where
 * they are three of seven and are the admin's actual work; the strip stays, and both roads lead to the same
 * screens. القطع is out for good — the tree is the unit (owner, 2026-09-18), an offer's trees are a tab on the
 * offer — and المطابقة has no row, because it is a section on a client's file and not a destination.
 */
const ROW_RULES: Record<WorkspaceRow, RowRule> = {
  "/admin": { icon: "dashboard" },
  "/admin/desk/calls": { icon: "requests", roles: CALL_DESK_ROLES },
  "/admin/desk/field": { icon: "visits", roles: CRM_READ_ROLES },
  "/admin/leads": { icon: "requests", roles: CRM_READ_ROLES },
  "/admin/persons": { icon: "users", roles: CRM_READ_ROLES, flag: "zitounti" },
  "/admin/visits": { icon: "visits", roles: CRM_READ_ROLES, flag: "visits" },
  "/admin/reservations": { icon: "reservations", roles: CRM_READ_ROLES, flag: "reservations" },
  "/admin/analytics": { icon: "analytics", roles: CRM_READ_ROLES },
  // The other session's sale flow: its own layout gates it on requireStaff() alone, so the row does too.
  "/admin/v2": { icon: "offers" },
  "/admin/projects": { icon: "offers", flag: "projects" },
  "/admin/agri": { icon: "services", roles: AGRI_ROLES, flag: "agri_backoffice" },
  // The bars are the season's kilos. nav-icons.tsx has no glyph for a harvest, and that file is not this
  // change's to grow.
  "/admin/harvest": { icon: "analytics", flag: "harvest" },
  "/admin/land-offers": { icon: "land", roles: LAND_OFFER_ROLES, flag: "land_offers" },
  "/admin/installments": { icon: "payments", roles: PRICE_ROLES, flag: "installments" },
  "/admin/contracts": { icon: "contracts", roles: CRM_READ_ROLES, flag: "contracts" },
  "/admin/pricing": { icon: "pricing", roles: PRICE_ROLES, flag: "pricing" },
  "/admin/subscriptions": { icon: "services", roles: CRM_READ_ROLES, flag: "subscriptions" },
  // 0136: commissions are money, read and paid by Finance and Admin (app.can_record_money).
  "/admin/referrals": { icon: "payments", roles: PRICE_ROLES, flag: "referrals" },
  "/admin/desk/legal": { icon: "contracts", roles: LEGAL_DESK_ROLES },
  "/admin/desk/legal/partners": { icon: "users", roles: LEGAL_DESK_ROLES },
  "/admin/desk/legal/checklist": { icon: "lists", roles: LEGAL_DESK_ROLES },
  "/admin/settings": { icon: "settings", roles: ADMIN_ROLES },
  "/admin/settings/modules": { icon: "modules", roles: ADMIN_ROLES },
  "/admin/settings/lists": { icon: "lists", roles: ADMIN_ROLES },
  "/admin/settings/media": { icon: "media", roles: ADMIN_ROLES },
  "/admin/settings/translations": { icon: "translations", roles: ADMIN_ROLES },
  "/admin/settings/languages": { icon: "languages", roles: ADMIN_ROLES },
  // 0152: a message to every phone with the app reaches the buyers, so it is Admin's and nobody else's.
  "/admin/notifications": { icon: "notifications", roles: ADMIN_ROLES },
  // Records, not settings: who may sign in, and what everyone did. They keep their own rows.
  "/admin/users": { icon: "users", roles: ADMIN_ROLES },
  "/admin/audit": { icon: "audit", roles: ADMIN_ROLES },
};

/**
 * The rows this session may open, one group per workspace it holds, in reading order.
 *
 * A row the reader may not open is not returned, and a row whose module is off comes back quiet (`off`)
 * with a badge — because a section that is switched off must never look like one that is live. The layout
 * turns these into sidebars; صفحة البداية turns them into squares.
 */
export function workspaceRows(session: StaffSession, config: PublicConfig): RowGroup[] {
  const row = (href: WorkspaceRow): NavItem | null => {
    const { icon, roles, flag } = ROW_RULES[href];
    if (roles && !hasRole(session, roles)) return null;

    const state = flag ? flagState(config, flag) : "public";
    const badge = state === "disabled" ? NAV_STATE_LABELS.off : state === "internal" ? NAV_STATE_LABELS.internal : undefined;

    return { href, label: ADMIN_LABELS[href], icon, badge, off: state === "disabled" };
  };

  return heldWorkspaces(session.roles).map((workspace) => {
    const hrefs: readonly WorkspaceRow[] = workspace.rows;
    return {
      key: workspace.key,
      label: workspace.label,
      items: hrefs.map(row).filter((item): item is NavItem => item !== null),
    };
  });
}
