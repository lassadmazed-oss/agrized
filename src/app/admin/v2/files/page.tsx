import type { Metadata } from "next";
import Link from "next/link";

import { requireStaff } from "@/lib/auth";
import { formatCount, formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { Filter, Row, Rows, Screen } from "../ui";

export const metadata: Metadata = { title: "الملفات" };

/** One page of the list, same cap the other v2 lists ask for. */
const PAGE = 100;

/** A ceiling on `?page=`, so a hand-typed number cannot hand Postgres an offset that overflows int4 and turn
 *  the list into «تعذّر جلب الملفات». A million files in, this is somebody else's problem. */
const MAX_PAGE = 10_000;

type FileRow = {
  person_id: string;
  full_name: string | null;
  phone_e164: string | null;
  status_label_ar: string | null;
  assigned_to_name: string | null;
  offer_trees: number | null;
  tree_count_label_ar: string | null;
  project_name: string | null;
  created_at: string;
  persons_total: number | null;
};

/**
 * الملفات — one row per client, not per demand.
 *
 * v1's list is the same data with sixteen filters above it, a column for every field the intake collects, and
 * two view modes. It is a research tool. This is the working list: who is waiting, at which step, and whose
 * job it is. Everything else is one tap away inside the file.
 *
 * THE SEARCH MOVED INTO THE HEAD ROW. It used to be its own block: a full-width input and a «لوّج» button on
 * a line of their own, stacked above a pill strip that is itself one line — two blocks for two controls,
 * before a single client is visible. Beside the title it costs the head row plus the strip. The honest number:
 * the old block was ~56px of page, and 44px controls on a 28px title line grow the head row by ~23px, so the
 * saving is ~33px, not 56 — one third of a row, and the list starts within the first screen on a phone.
 *
 * WHICH MEANS THE HEAD ROW IS NOW THE TIGHT ONE. `Screen`'s head is a single line that does not wrap, so the
 * form is the part that has to give: the field is `max-w-36` and `min-w-0` rather than a definite `w-36`, and
 * it shrinks on a 320px phone instead of pushing the count off the row. An input's automatic minimum size is
 * its intrinsic ~180px, so the `min-w-0` is what makes that possible at all, not decoration.
 *
 * AN ACTIVE SEARCH IS A TOKEN IN THAT SAME STRIP, and pressing it clears the search. Without it the only way
 * back to the full list is to select the text, delete it and submit again — three moves to undo one. The token
 * also states what is narrowing the list, which an input cannot once it is scrolled off the top. It is drawn
 * gold and outlined, NOT as a selected pill: it removes a filter, and a control that widens the set must not
 * be pixel-identical to the pill next to it that narrows it, nor tell a screen reader it is the current page.
 *
 * THE STRIP IS LOCAL, not `Filters` from ui.tsx. That component asks for `no-scrollbar`, a class no rule in
 * the stylesheet defines, so it draws a grey rail under the chips on every desktop that reserves one — the
 * same bug workflow-nav.tsx diagnosed and fixed only for itself. `rail-none` (globals.css) is the utility
 * that actually exists. When `Filters` sets those two properties, this can go back to using it.
 *
 * WHAT THE STRIP CANNOT SAY. crm_search_requests counts the set it was handed, not each status, so a pill
 * here cannot carry its own number the way العقود and الحجوزات do. The head counts what is on the screen, as
 * it does on those two — a head number that means «rows you are looking at» on three lists and «rows that
 * matched» on the fourth is worse than either.
 *
 * AND THE CAP HAS A DOOR IN IT. The RPC returns a hundred rows and takes an offset, so the line under the
 * list states the range it is showing out of the whole set and carries «أحدث» / «أقدم» either side of it.
 * Stating «أوّل ١٠٠ من ٤٠٠» with no way to the other three hundred is worse than not saying it: the reader
 * learns the list is lying to them and that guessing a name is their only recourse. Rows come back newest
 * first, so the next page is the older one, and that is what the two words say. Changing a status or the
 * search text drops you back to the first page — `link()` only carries `page` when it is asked to, and the
 * search form does not post it at all.
 *
 * Search and status both go through crm_search_requests, the same function v1 searches with, so a filter here
 * can never disagree with a filter there.
 */
export default async function FilesPage({ searchParams }: PageProps<"/admin/v2/files">) {
  await requireStaff();
  const supabase = await createClient();
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const statusId = typeof params.status_id === "string" ? params.status_id : "";
  const asked = typeof params.page === "string" ? Number.parseInt(params.page, 10) : Number.NaN;
  const page = Number.isFinite(asked) && asked > 1 ? Math.min(asked, MAX_PAGE) : 1;
  const offset = (page - 1) * PAGE;

  const [{ data: statuses }, { data, error }] = await Promise.all([
    supabase.from("lead_statuses").select("id, label_ar, sort_order").eq("is_active", true).order("sort_order"),
    supabase.rpc("crm_search_requests", {
      p: { people: true, ...(q ? { q } : {}), ...(statusId ? { status_id: statusId } : {}) },
      p_limit: PAGE,
      p_offset: offset,
    }),
  ]);

  const rows = (data ?? []) as unknown as FileRow[];
  // persons_total is the whole filtered set, not the page (0052). It only rides along on a row, so a page past
  // the end has no total to report — which is fine, since the only thing that page offers is the way back.
  const total = rows[0]?.persons_total ?? rows.length;

  const link = (next: Record<string, string>) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (statusId) query.set("status_id", statusId);
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    const text = query.toString();
    return text ? `/admin/v2/files?${text}` : "/admin/v2/files";
  };

  const empty = error
    ? "تعذّر جلب الملفات."
    : rows.length > 0
      ? undefined
      : page > 1
        ? "ما فماش ملفات في هالصفحة."
        : q || statusId
          ? "ما فماش ملفات بهالبحث."
          : "ما فماش ملفات بعد.";

  const first = offset + 1;
  const last = offset + rows.length;
  const older = total > last;
  const newer = page > 1;

  return (
    <Screen
      title="الملفات"
      count={rows.length}
      action={
        // items-center inside, so the input and the button line up with each other while the form as a whole
        // hangs on the title's baseline. min-w-0 twice and a max width instead of a fixed one: the head row
        // cannot wrap, so this form is what shrinks when the viewport does.
        <form action="/admin/v2/files" className="flex min-w-0 items-center gap-1.5">
          {statusId ? <input type="hidden" name="status_id" value={statusId} /> : null}
          <input
            name="q"
            defaultValue={q}
            aria-label="لوّج في الملفات"
            placeholder="اسم ولا تلفون"
            autoComplete="off"
            className="field field-sm min-w-0 flex-1 max-w-36 sm:max-w-56"
          />
          <button type="submit" className="btn btn-primary btn-sm shrink-0">
            لوّج
          </button>
        </form>
      }
    >
      <div className="rail-none -mx-1 flex gap-1 overflow-x-auto px-1">
        {q ? (
          // Not a `Filter`: this one removes. Outlined gold, and no aria-current, so neither the eye nor a
          // screen reader reads it as the selected member of the set it sits in.
          <Link
            href={link({ q: "" })}
            className="shrink-0 rounded-lg border border-gold/50 px-2.5 py-1 text-xs font-semibold text-gold transition-colors hover:bg-gold-soft/60"
          >
            <span className="inline-block max-w-28 truncate align-middle">بحث: {q}</span>
            <span aria-hidden className="ms-1 opacity-70">
              ✕
            </span>
            <span className="sr-only">— نحّي البحث</span>
          </Link>
        ) : null}
        <Filter href={link({ status_id: "" })} active={!statusId}>
          الكل
        </Filter>
        {(statuses ?? []).map((status) => (
          <Filter key={status.id} href={link({ status_id: status.id })} active={statusId === status.id}>
            {status.label_ar}
          </Filter>
        ))}
      </div>

      <Rows empty={empty}>
        {rows.map((row) => {
          // An offer demand names its own tree count; a calculator demand only has the range it picked.
          const trees = row.offer_trees ? `${formatCount(row.offer_trees)} زيتونة` : row.tree_count_label_ar;
          const context = row.project_name ?? trees;
          const when = formatDate(row.created_at);

          return (
            <Row
              key={row.person_id}
              href={`/admin/v2/files/${row.person_id}`}
              title={row.full_name ?? "بلا اسم"}
              subtitle={row.phone_e164 ?? undefined}
              // No «—» anywhere: a demand that named neither a project nor a size lets the date take the
              // line instead of holding a dash where a project should be.
              middle={context ?? when}
              middleSub={context ? (row.project_name && trees ? `${trees} · ${when}` : when) : undefined}
              end={row.status_label_ar ?? undefined}
              endSub={row.assigned_to_name ?? "بلا مسؤول"}
            />
          );
        })}
      </Rows>

      {newer || older ? (
        <nav aria-label="تصفّح الملفات" className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span className="justify-self-start">
            {newer ? (
              // Page 2 goes back to a bare /admin/v2/files, not ?page=1 — one address for the first page.
              <Link href={link({ page: page > 2 ? String(page - 1) : "" })} className="btn btn-secondary btn-sm">
                أحدث
              </Link>
            ) : null}
          </span>
          <span className="text-center text-[0.6875rem] text-muted tabular-nums">
            {rows.length > 0 ? `${formatCount(first)}–${formatCount(last)} من ${formatCount(total)}` : null}
          </span>
          <span className="justify-self-end">
            {older ? (
              <Link href={link({ page: String(page + 1) })} className="btn btn-secondary btn-sm">
                أقدم
              </Link>
            ) : null}
          </span>
        </nav>
      ) : null}
    </Screen>
  );
}
