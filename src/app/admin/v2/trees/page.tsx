import type { Metadata } from "next";

import { requireStaff } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { Filter, Filters, Row, Rows, Screen } from "../ui";

export const metadata: Metadata = { title: "الزيتونات" };

/**
 * الزيتونات — find one tree by its number.
 *
 * WHY THIS SCREEN EXISTS AT ALL. A client rings and says «عندي TX-00215-0007». Until now there was no way to
 * answer him: the codes live on a tab inside one offer, so a staff member had to already know which offer the
 * tree belonged to in order to look it up — which is the one thing the caller cannot tell you. v1 has no
 * global lookup anywhere. This is it, and it is one field.
 *
 * THE SEARCH IS A PREFIX, DELIBERATELY. `ilike 'TX-00215%'` answers both «which tree is this» and «show me
 * that offer's trees», which are the same question asked with different amounts of the code. It runs on the
 * indexed column and never wraps the pattern in a leading %, so a typo returns nothing instead of scanning
 * 8,600 rows.
 *
 * WHO HOLDS IT comes from the embedded person, not from a second query: public.trees.held_by is a real
 * foreign key, so RLS decides what a given reader may see of the holder — a commercial who may not open that
 * client's file sees the tree and no name, rather than a name leaking through a lookup screen.
 */
type TreeState = "available" | "reserved" | "sold";

const STATES: Array<{ key: "" | TreeState; label: string }> = [
  { key: "", label: "الكل" },
  { key: "available", label: "متاحة" },
  { key: "reserved", label: "محجوزة" },
  { key: "sold", label: "مباعة" },
];

/** The filter only ever reaches the query as one of the three states the enum actually has. */
function asState(value: string): TreeState | null {
  return value === "available" || value === "reserved" || value === "sold" ? value : null;
}

export default async function TreesPage({ searchParams }: PageProps<"/admin/v2/trees">) {
  await requireStaff();
  const supabase = await createClient();
  const params = await searchParams;

  const q = typeof params.q === "string" ? params.q.trim() : "";
  const state = typeof params.state === "string" ? (asState(params.state) ?? "") : "";

  let rows: Array<{
    id: string;
    code: string;
    state: string;
    allocated_at: string | null;
    project: { name: string; code: string } | null;
    holder: { id: string; full_name: string | null } | null;
  }> = [];
  let failed = false;

  if (q.length >= 2) {
    let query = supabase
      .from("trees")
      .select(
        "id, code, state, allocated_at, project:projects(name, code), holder:persons!trees_held_by_fkey(id, full_name)",
      )
      .ilike("code", `${q}%`)
      .order("code")
      .limit(60);
    const filter = asState(state);
    if (filter) query = query.eq("state", filter);

    const { data, error } = await query;
    failed = Boolean(error);
    rows = (data ?? []) as unknown as typeof rows;
  }

  const link = (next: Record<string, string>) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (state) query.set("state", state);
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    const text = query.toString();
    return text ? `/admin/v2/trees?${text}` : "/admin/v2/trees";
  };

  const empty = failed
    ? "تعذّر البحث."
    : q.length < 2
      ? "اكتب رقم الزيتونة ولا أوّل حروفو."
      : rows.length === 0
        ? "ما فماش زيتونة بهذا الرقم."
        : undefined;

  return (
    <Screen title="الزيتونات" count={q.length >= 2 && !failed ? rows.length : null}>
      <form action="/admin/v2/trees" className="flex gap-2">
        {state ? <input type="hidden" name="state" value={state} /> : null}
        <input
          name="q"
          defaultValue={q}
          dir="ltr"
          placeholder="TX-00215-0007"
          autoComplete="off"
          className="field h-9 flex-1 text-sm"
        />
        <button type="submit" className="btn btn-primary btn-sm">
          لوّج
        </button>
      </form>

      <Filters>
        {STATES.map((s) => (
          <Filter key={s.key || "all"} href={link({ state: s.key })} active={state === s.key}>
            {s.label}
          </Filter>
        ))}
      </Filters>

      <Rows empty={empty}>
        {rows.map((tree) => (
          <Row
            key={tree.id}
            // A held tree opens the file that holds it; a free one opens its offer. Either way the row
            // answers the question that made someone search for a code.
            href={tree.holder ? `/admin/v2/sell?person=${tree.holder.id}` : "/admin/v2/offers"}
            title={<span dir="ltr">{tree.code}</span>}
            subtitle={tree.project?.name ?? undefined}
            middle={tree.holder?.full_name ?? undefined}
            middleSub={tree.allocated_at ? formatDate(tree.allocated_at) : undefined}
            end={STATES.find((s) => s.key === tree.state)?.label ?? tree.state}
          />
        ))}
      </Rows>
    </Screen>
  );
}
