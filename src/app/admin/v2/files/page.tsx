import type { Metadata } from "next";

import { requireStaff } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { Filter, Filters, Row, Rows, Screen } from "../ui";

export const metadata: Metadata = { title: "الملفات" };

type Row = {
  person_id: string;
  full_name: string | null;
  phone_e164: string | null;
  status_label_ar: string | null;
  stage: string | null;
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
 * The search and the status pills are the only two controls, because they are the only two questions anyone
 * asks standing at this screen — «لقّيلي هالعبد» and «شكون مازال في جديد». Both are handled by
 * crm_search_requests in Postgres, the same function v1 searches with, so a filter here can never disagree
 * with a filter there.
 */
export default async function FilesPage({ searchParams }: PageProps<"/admin/v2/files">) {
  await requireStaff();
  const supabase = await createClient();
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const statusId = typeof params.status_id === "string" ? params.status_id : "";

  const [{ data: statuses }, { data, error }] = await Promise.all([
    supabase.from("lead_statuses").select("id, label_ar, sort_order").eq("is_active", true).order("sort_order"),
    supabase.rpc("crm_search_requests", {
      p: { people: true, ...(q ? { q } : {}), ...(statusId ? { status_id: statusId } : {}) },
      p_limit: 100,
      p_offset: 0,
    }),
  ]);

  const rows = (data ?? []) as unknown as Row[];
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

  const empty = error ? "تعذّر جلب الملفات." : rows.length === 0 ? "ما فماش ملفات بهالبحث." : undefined;

  return (
    <Screen title="الملفات" count={total}>
      <form action="/admin/v2/files" className="flex gap-2">
        {statusId ? <input type="hidden" name="status_id" value={statusId} /> : null}
        <input
          name="q"
          defaultValue={q}
          placeholder="اسم ولا رقم تلفون"
          className="field h-9 flex-1 text-sm"
          autoComplete="off"
        />
        <button type="submit" className="btn btn-primary btn-sm">
          لوّج
        </button>
      </form>

      <Filters>
        <Filter href={link({ status_id: "" })} active={!statusId}>
          الكل
        </Filter>
        {(statuses ?? []).map((status) => (
          <Filter key={status.id} href={link({ status_id: status.id })} active={statusId === status.id}>
            {status.label_ar}
          </Filter>
        ))}
      </Filters>

      <Rows empty={empty}>
        {rows.map((row) => (
          <Row
            key={row.person_id}
            href={`/admin/v2/files/${row.person_id}`}
            title={row.full_name ?? "بلا اسم"}
            subtitle={row.phone_e164 ?? undefined}
            middle={row.project_name ?? row.tree_count_label_ar ?? "—"}
            middleSub={formatDate(row.created_at)}
            end={row.status_label_ar ?? "—"}
            endSub={row.assigned_to_name ?? "بلا مسؤول"}
          />
        ))}
      </Rows>
    </Screen>
  );
}
