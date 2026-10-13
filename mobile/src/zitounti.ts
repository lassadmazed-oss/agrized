import { supabase } from "./api";

/**
 * فضاء «زيتونتي» — the buyer's own file, read by the app.
 *
 * WHY THE APP MAY READ THIS AT ALL, when it may not read public.persons. `my_zitounti_file()` takes NO
 * ARGUMENT: it resolves the person from auth.uid() through persons.profile_id, so there is nowhere for a
 * caller to put somebody else's id. That is why it is granted to `authenticated` while every other reader in
 * this area is service-role only — checked against the live database before this file was written. The app
 * signs in through /api/mobile/auth/* (src/auth.tsx), sets the session on the shared client, and this call
 * then answers for that buyer and nobody else.
 *
 * IT IS THE SAME PAYLOAD THE WEBSITE DRAWS, from the same function, so the two screens cannot disagree about
 * what a client owns. The shapes and the failure mapping below are src/lib/zitounti.ts's, copied rather than
 * imported — the same boundary theme.ts explains for colours: nothing crosses from the web app into the
 * bundle. Where a value is a decision rather than a shape (the ten rows and their order, which row speaks for
 * two sections) the comment says where the original lives, so a change there can be repeated here.
 *
 * NO ARITHMETIC. Amounts are integer millimes exactly as the database holds them, and every total the screen
 * prints is already a column of the payload. Nothing here adds two money figures together.
 */

export const SECTION_KEYS = [
  "trees",
  "requests",
  "reservations",
  "visits",
  "payments",
  "contracts",
  "installments",
  "operations",
  "subscription",
  "harvest",
  "documents",
] as const;

export type SectionKey = (typeof SECTION_KEYS)[number];
export type SectionStatus = "ok" | "closed" | "not_built" | "phase_later";
export type Section = { status: SectionStatus; items: unknown[]; count: number };

export type Totals = {
  trees: number;
  trees_sold: number;
  trees_reserved: number;
  offers: number;
  paid_millimes: number | null;
};

export type Person = {
  id: string;
  full_name: string;
  phone_e164: string;
  whatsapp_e164: string | null;
  email: string | null;
  governorate: string | null;
  delegation: string | null;
  created_at: string;
};

export type ZitountiFile = Record<SectionKey, Section> & {
  person: Person;
  totals: Totals;
  read_at: string;
};

/** Where each row's TITLE comes from — src/lib/zitounti.ts's ZITOUNTI_SECTION_SETTING, so a rename reaches both. */
export const SECTION_SETTING: Record<SectionKey, string> = {
  trees: "zitounti.section_trees",
  requests: "zitounti.section_requests",
  reservations: "zitounti.section_reservations",
  visits: "zitounti.section_visits",
  payments: "zitounti.section_payments",
  contracts: "zitounti.section_contracts",
  // The owner's label for the contracts row is «العقود والأقساط» — one line over two sections of the payload.
  installments: "zitounti.section_contracts",
  operations: "zitounti.section_operations",
  subscription: "zitounti.section_subscription",
  harvest: "zitounti.section_harvest",
  documents: "zitounti.section_documents",
};

/**
 * The ten rows the website lists, in its order — zitounti/page.tsx's SECTIONS.
 *
 * `also` is the second section a row speaks for: the contracts row covers instalments too, so its count is
 * the pair's and it opens when either holds rows.
 */
export const SECTIONS: readonly { key: SectionKey; also?: SectionKey }[] = [
  { key: "trees" },
  { key: "requests" },
  { key: "reservations" },
  { key: "visits" },
  { key: "payments" },
  { key: "contracts", also: "installments" },
  { key: "operations" },
  { key: "subscription" },
  { key: "harvest" },
  { key: "documents" },
];

export type Failure = "not_signed_in" | "no_file" | "closed" | "forbidden" | "not_applied" | "error";
export type FileResult = { ok: true; file: ZitountiFile } | { ok: false; reason: Failure };

/** src/lib/zitounti.ts's failureOf, unchanged: the database states the reason and this only names it. */
function failureOf(error: { code?: string; message?: string }): Failure {
  if (error.code === "PGRST202" || error.code === "42883") return "not_applied";
  if (error.message === "not_signed_in") return "not_signed_in";
  if (error.message === "no_file") return "no_file";
  if (error.message === "module_closed") return "closed";
  if (error.message === "forbidden") return "forbidden";
  // 42501 is Postgres refusing the EXECUTE grant itself — what an unauthenticated caller gets, since the
  // function is revoked from anon. Here it means the session expired between signing in and reading.
  if (error.code === "42501") return "forbidden";
  return "error";
}

export async function fetchMyFile(): Promise<FileResult> {
  const { data, error } = await supabase.rpc("my_zitounti_file");
  if (error) return { ok: false, reason: failureOf(error) };
  if (!data) return { ok: false, reason: "error" };
  return { ok: true, file: data as unknown as ZitountiFile };
}

/** The owner's sentence for a file that did not open. Every key exists; checked against settings. */
export function failureKey(reason: Failure): string {
  switch (reason) {
    case "not_signed_in":
      return "ui.zitounti.failure_not_signed_in";
    case "no_file":
      return "ui.zitounti.failure_no_file";
    case "closed":
      return "ui.zitounti.failure_closed";
    case "forbidden":
      return "ui.zitounti.failure_forbidden";
    case "not_applied":
      return "ui.zitounti.failure_not_applied";
    default:
      return "ui.zitounti.failure_error";
  }
}

export type Row = {
  key: SectionKey;
  label: string;
  /** The count when the row has rows, «ما فمّاش» when it is empty, or why it is not open yet. */
  note: string;
  /** True when the section holds something a reader could open. */
  open: boolean;
};

/**
 * The rows, built exactly as zitounti/page.tsx builds them.
 *
 * A row speaking for two sections is openable when EITHER is, and reports «closed» only while both are. And
 * «مازال ما تركّبش» is a different answer from «يُبنى في دفعة قادمة»: the first is a record the database does
 * not hold yet, the second a module the owner has not opened.
 */
export function buildRows(
  file: ZitountiFile | null,
  text: (key: string) => string,
  count: (value: number) => string,
  noFileNote: string | null,
): Row[] {
  const empty = text("zitounti.section_empty");
  const notBuilt = text("zitounti.section_not_built");
  const later = text("zitounti.section_later");

  return SECTIONS.flatMap((section): Row[] => {
    const label = text(SECTION_SETTING[section.key]);
    if (!label) return [];
    if (!file) return [{ key: section.key, label, note: noFileNote ?? "", open: false }];

    const primary = file[section.key];
    const extra = section.also ? file[section.also] : null;
    const total = (primary?.count ?? 0) + (extra?.count ?? 0);
    const status: SectionStatus =
      primary?.status === "ok" || extra?.status === "ok" ? "ok" : (primary?.status ?? "error" as SectionStatus);

    if (status === "ok") {
      return [{ key: section.key, label, note: total > 0 ? count(total) : empty, open: total > 0 }];
    }
    return [{ key: section.key, label, note: status === "not_built" ? notBuilt : later, open: false }];
  });
}
