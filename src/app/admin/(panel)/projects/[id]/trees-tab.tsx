"use client";

// Tab «الزيتونات»: the offer's inventory — four counts, the numbers they run between, the smallest basket it
// sells, the button that numbers them, and the one correction stock keeping owns: putting a tree back on sale.
//
// It replaces «القطع». The owner: «remove the pieces thing, its simply selling the trees» · «we just give each
// tree a number or an id and associate it with the client». So there is nothing to type here: a tree has no
// fields. Every figure is counted in Postgres by staff_offer_stock (0054) and read through ../offer-stock —
// the one sanctioned reader — never summed here.
//
// THE OTHER HALF OF THE ACT IS NOT HERE, ON PURPOSE. Reserving a tree for a client and marking it sold are CRM
// acts: the database gates them on app.can_see_person, so they happen on the client's file
// (/admin/leads/[personId]), where the person, the demand and the number asked for already are. This tab is the
// stock keeper's side — numbering, and releasing a reservation made by mistake. Putting all four controls on one
// screen would force each of the two audiences to look at buttons the database will never let them press.
//
// WHY A PAGE OF CODES AND NOT A SUMMARY. The four tiles at the head of the offer already summarise. What a
// reader opens this tab for is the other question — «أنهي زيتونة، وعند شكون» — and that is answered by codes,
// not by totals. So the list is codes, filtered by state, fifty at a time, and an available tree is never
// listed: five hundred identical rows reading «متاحة · بلا صاحب» tell nobody anything, and the tile above
// already counts them.
//
// WHY THIS MODULE IS A CLIENT COMPONENT. Releasing takes a selection and a written reason, and the Server
// Action it calls (setTreeState) takes an object, not a form — the same shape GenerateTreesButton already
// calls. OfferStockTiles rides along: it is four static tiles, and the module is in this route's bundle either
// way, so splitting it would buy nothing.
//
// Three stock states, and each says what to do:
//   ok            the four counts, and the code range under them
//   not_generated nobody has numbered this offer's trees yet — the stock is unknown, not empty
//   partial       the rows and tree_count disagree — one button fixes it, and it is the same button

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { ReasonField } from "@/components/admin/reason-field";
import { DataList, DataRow, EmptyState, SectionHeader, StatTile, StatusPill } from "@/components/ui";
import { intakeErrorMessage } from "@/lib/errors";
import { formatCount, formatDate } from "@/lib/format";

import { setTreeState } from "../actions";
import type { OfferStock } from "@/lib/backoffice/offers/stock";
import { GenerateTreesButton } from "./generate-trees-button";
import { isTreeFilter, TREE_FILTERS, type TreeFilter } from "./tree-filter";

/** The Arabic of the four figures lives in settings (offers.stock_*, 0054), never in this file. */
export type StockLabels = { total: string; available: string; reserved: string; sold: string };

/** One tree that somebody holds, with the person it is held for. */
export type HeldTree = {
  id: string;
  code: string;
  state: "available" | "reserved" | "sold";
  allocatedAt: string | null;
  holderId: string | null;
  holderName: string | null;
};

/**
 * Which held trees the list is showing. «available» is not one of them: see the header.
 *
 * The filter and its list now live in ./tree-filter, a module with no "use client", because the server page
 * reads the filter out of the address and a Server Component cannot import a real VALUE from a client module —
 * it gets a client-reference proxy, which is why TREE_FILTERS.includes() threw. Re-exported here so the tab's
 * own importers keep one place to look.
 */
export { TREE_FILTERS, isTreeFilter, type TreeFilter };

const STATE_TONE = { available: "line", reserved: "warning", sold: "success" } as const;

function stateLabel(state: HeldTree["state"], labels: StockLabels): string {
  return state === "sold" ? labels.sold : state === "reserved" ? labels.reserved : labels.available;
}

/**
 * The four figures, above the tabs: what the offer IS, exactly where the owner reads it. When the trees are not
 * numbered yet it says so instead of printing four zeros — «0 متاحة» and «sold out» must never look alike.
 */
export function OfferStockTiles({
  stock,
  labels,
  treesHref,
}: {
  stock: OfferStock;
  labels: StockLabels;
  /** Where the work on the trees is: the الزيتونات tab. */
  treesHref: string;
}) {
  if (stock.status === "not_generated") {
    return (
      <div className="card border-dashed border-line-strong p-5 shadow-none sm:p-6">
        <div className="stat">
          <p className="stat-label">{labels.total}</p>
          <p className={`stat-figure ${stock.trees_declared ? "" : "text-muted"}`.trim()}>{formatCount(stock.trees_declared ?? 0)}</p>
          <p className="text-xs text-muted">العدد المصرّح به في بطاقة العرض.</p>
        </div>
        <p className="mt-4 text-sm leading-6 text-muted">
          زيتونات هذا العرض مازالت ما ترقّمتش، فما نجّموش نقولو شنوّة متاح وشنوّة محجوز وشنوّة مباع. رقّمها في تبويب{" "}
          <Link href={treesHref} className="font-semibold text-forest underline underline-offset-4">
            «الزيتونات»
          </Link>{" "}
          وكل زيتونة تولّي عندها رقم وحالة وصاحب.
        </p>
      </div>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-snug lg:grid-cols-4">
      <StatTile size="sm" label={labels.total} value={stock.trees_total} note="زيتونة مرقّمة في قاعدة البيانات" />
      <StatTile size="sm" label={labels.available} value={stock.trees_available} quiet={stock.trees_available === 0} note="ما حجزها حتى حد" />
      <StatTile size="sm" label={labels.reserved} value={stock.trees_reserved} quiet={stock.trees_reserved === 0} note="محجوزة لشخص معيّن" />
      <StatTile size="sm" label={labels.sold} value={stock.trees_sold} quiet={stock.trees_sold === 0} note="تعاقدنا عليها" />
    </dl>
  );
}

export function TreesTab({
  projectId,
  offerCode,
  stock,
  labels,
  codeRange,
  held,
  declaredTrees,
  canManage,
  canRelease,
  offerMinimum,
  filter,
  page,
  pageSize,
  matched,
  reasonMin,
}: {
  projectId: string;
  offerCode: string;
  stock: OfferStock;
  labels: StockLabels;
  /** First and last code in tree order (seq), so the range reads OFF-AIRPORT-0001 → OFF-AIRPORT-0500. */
  codeRange: { first: string; last: string } | null;
  /** This page of the trees somebody holds. Every other tree of the offer is available and identical. */
  held: readonly HeldTree[];
  declaredTrees: number | null;
  /** app.can_manage_trees: agri manager, Finance and Admin. A commercial never creates inventory. */
  canManage: boolean;
  /**
   * app.can_manage_trees AND app.can_see_person(holder) — and a held tree always has a holder (0054 §7), so the
   * two lists meet on Finance and Admin only. The agricultural manager numbers but cannot release a tree that
   * belongs to a file they may not read, and the database would refuse the call.
   */
  canRelease: boolean;
  /** projects.min_trees_per_order: null means this offer inherits the setting offers.min_trees_default. */
  offerMinimum: number | null;
  filter: TreeFilter;
  page: number;
  pageSize: number;
  /** How many trees match the filter, counted by Postgres. */
  matched: number;
  /** settings audit.reason_min_length; app.require_reason checks it again (§51). */
  reasonMin: number;
}) {
  const noTreeCount = !declaredTrees || declaredTrees < 1;
  const ownMinimum = offerMinimum !== null;

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const lastPage = Math.max(1, Math.ceil(matched / pageSize));
  const selectable = canRelease && held.length > 0;
  const allOnPage = held.length > 0 && held.every((tree) => selected.has(tree.id));

  function toggle(id: string, on: boolean) {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
    setError(null);
    setDone(null);
  }

  function toggleAll(on: boolean) {
    setSelected(on ? new Set(held.map((tree) => tree.id)) : new Set());
    setError(null);
    setDone(null);
  }

  function release() {
    const form = formRef.current;
    // The browser asks for the reason, in its own bubble, before anything leaves the page.
    if (!form || !form.reportValidity()) return;
    const reason = String(new FormData(form).get("reason") ?? "").trim();
    setError(null);
    setDone(null);
    if (selected.size < 1) {
      setError(intakeErrorMessage("invalid_tree_selection"));
      return;
    }
    if (reason.length < reasonMin) {
      setError(intakeErrorMessage("reason_required"));
      return;
    }

    startTransition(async () => {
      const result = await setTreeState({
        treeIds: [...selected],
        state: "available",
        reason: `${reason} — تحرير زيتونات من تبويب الزيتونات متاع العرض ${offerCode}.`,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(`رجعت ${formatCount(result.trees)} زيتونة «${labels.available}»، وتنجّم تتحجز من جديد لحريف آخر.`);
      setSelected(new Set());
      form.reset();
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="زيتونات هذا العرض"
        description="كل زيتونة عندها رقم وحالة وصاحب. العرض يتباع بالزيتونة، والحريف ياخذ عدد، والنظام هو اللي يقول أنهي زيتونات."
      />

      {stock.status === "partial" ? (
        <p className="rounded-xl bg-gold-soft px-4 py-3 text-sm leading-6 text-forest-700">
          العدد المرقّم ({formatCount(stock.trees_total)}) يختلف على العدد المصرّح به في البطاقة (
          {formatCount(stock.trees_declared ?? 0)}). أعد الترقيم من تحت باش يتساوو، وإلاّ بدّل «عدد الأشجار» في بيانات العرض.
        </p>
      ) : null}

      <div className="card p-5 sm:p-6">
        <DataList variant="grid" columns={3} className="text-sm">
          <DataRow layout="stacked" label="أرقام الزيتونات" numeric={false}>
            {codeRange ? (
              <span dir="ltr" className="inline-block">
                {codeRange.first} → {codeRange.last}
              </span>
            ) : (
              <span className="text-muted">مازالت ما ترقّمتش</span>
            )}
          </DataRow>
          <DataRow layout="stacked" label="أقلّ عدد زيتونات في الطلب">
            {formatCount(stock.min_trees)}
            <span className="block text-xs font-normal text-muted">
              {ownMinimum ? "خاص بهذا العرض · يتبدّل من بطاقة العرض" : "الافتراضي من الإعدادات ← العروض · يتبدّل من بطاقة العرض"}
            </span>
          </DataRow>
          <DataRow layout="stacked" label="العدد المصرّح به في البطاقة">
            {declaredTrees ? formatCount(declaredTrees) : <span className="text-muted">ما تكتبش</span>}
          </DataRow>
        </DataList>

        {canManage ? (
          <div className="mt-4 border-t border-line pt-4">
            {noTreeCount ? (
              <p className="text-sm leading-6 text-muted">
                باش ترقّم الزيتونات لازم أولاً «عدد الأشجار» يتكتب في تبويب «بيانات العرض»: الترقيم يمشي من 1 حتى للعدد هذاك.
              </p>
            ) : (
              <>
                <GenerateTreesButton
                  projectId={projectId}
                  label={stock.status === "not_generated" ? "رقّم زيتونات هذا العرض" : "أعد ترقيم الزيتونات"}
                />
                <p className="hint mt-2">
                  الترقيم يزيد الأرقام الناقصة برك، فتنجّم تعاودو كي يتبدّل عدد الأشجار. رمز كل زيتونة يتبنى من صيغة
                  رمز العرض <span dir="ltr" className="inline-block">{offerCode}</span> (الإعدادات ← العروض). زيتونة
                  محجوزة ولا مباعة ما تتمحاش: حرّرها قبل ما تنقّص العدد.
                </p>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">
            الزيتونات المحجوزة والمباعة (<span className="tabular-nums">{formatCount(matched)}</span>)
          </h3>
          <nav aria-label="حالة الزيتونات" className="flex flex-wrap gap-tight">
            {TREE_FILTERS.map((value) => (
              <Link
                key={value}
                href={`/admin/projects/${projectId}?tab=trees${value === "held" ? "" : `&state=${value}`}`}
                aria-current={value === filter ? "true" : undefined}
                className="chip"
              >
                {value === "held" ? "الكل" : value === "reserved" ? labels.reserved : labels.sold}
              </Link>
            ))}
          </nav>
        </div>

        {held.length > 0 ? (
          <>
            {selectable ? (
              <label className="choice">
                <input
                  type="checkbox"
                  className="size-5 accent-forest"
                  checked={allOnPage}
                  onChange={(event) => toggleAll(event.target.checked)}
                  disabled={pending}
                />
                <span className="text-sm font-semibold">اختر كل زيتونات هذه الصفحة ({formatCount(held.length)})</span>
              </label>
            ) : null}

            <ul className="space-y-2">
              {held.map((tree) => (
                <li key={tree.id} className="card flex flex-wrap items-center justify-between gap-snug p-4 text-sm">
                  <span className="flex flex-wrap items-center gap-snug">
                    {selectable ? (
                      <input
                        type="checkbox"
                        className="size-5 accent-forest"
                        aria-label={`اختيار الزيتونة ${tree.code}`}
                        checked={selected.has(tree.id)}
                        onChange={(event) => toggle(tree.id, event.target.checked)}
                        disabled={pending}
                      />
                    ) : null}
                    <span dir="ltr" className="font-semibold tabular-nums">
                      {tree.code}
                    </span>
                    <StatusPill tone={STATE_TONE[tree.state]}>{stateLabel(tree.state, labels)}</StatusPill>
                  </span>
                  <span className="flex flex-wrap items-center gap-snug text-muted">
                    {tree.allocatedAt ? <span className="tabular-nums">{formatDate(tree.allocatedAt)}</span> : null}
                    {tree.holderId ? (
                      <Link href={`/admin/leads/${tree.holderId}`} className="font-semibold text-forest underline underline-offset-4">
                        {tree.holderName ?? "الملفّ"}
                      </Link>
                    ) : (
                      <span>بلا صاحب</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            {lastPage > 1 ? (
              <nav aria-label="صفحات الزيتونات" className="flex flex-wrap items-center justify-between gap-tight">
                <PageLink projectId={projectId} filter={filter} page={page - 1} disabled={page <= 1} label="→ السابق" />
                <p className="text-sm text-muted">
                  صفحة <span className="tabular-nums">{formatCount(page)}</span> من{" "}
                  <span className="tabular-nums">{formatCount(lastPage)}</span>
                </p>
                <PageLink projectId={projectId} filter={filter} page={page + 1} disabled={page >= lastPage} label="التالي ←" />
              </nav>
            ) : null}

            {selectable ? (
              <form ref={formRef} className="card space-y-3 p-4" onSubmit={(event) => event.preventDefault()}>
                <ReasonField
                  minLength={reasonMin}
                  id={`release-reason-${projectId}`}
                  label="سبب التحرير"
                  hint="يتسجّل في سجل العمليات مع حالة كل زيتونة قبل وبعد، ومن بعد ما يتبدّلش."
                />
                {error ? (
                  <p role="alert" className="error-text">
                    {error}
                  </p>
                ) : null}
                {done ? (
                  <p role="status" className="text-sm font-medium text-success">
                    {done}
                  </p>
                ) : null}
                <button type="button" onClick={release} disabled={pending || selected.size < 1} className="btn btn-secondary btn-sm">
                  {pending ? "جارٍ التحرير…" : `فكّ الحجز على ${formatCount(selected.size)} زيتونة`}
                </button>
                <p className="hint">
                  الزيتونة المحرّرة ترجع «{labels.available}» وتتنسى من ملفّ صاحبها، وترجع أول وحدة تتعطى للحريف الموالي.
                  الاختيار يمشي على هذه الصفحة برك. وإذا حرّرت زيتونة «{labels.sold}»، راك تحلّ عقد: تثبّت قبل.
                </p>
              </form>
            ) : null}
          </>
        ) : matched > 0 ? (
          // Reachable by typing a page number into the address: the list is not empty, this page of it is.
          <EmptyState
            size="sm"
            action={
              <PageLink projectId={projectId} filter={filter} page={1} disabled={false} label="ارجع للصفحة الأولى" />
            }
          >
            هذه الصفحة فارغة: فمّا <span className="tabular-nums">{formatCount(matched)}</span> زيتونة برك في هذه القائمة.
          </EmptyState>
        ) : (
          <EmptyState size="sm">
            {stock.status === "not_generated"
              ? "ما فماش زيتونات مرقّمة بعد، فما فماش حجز ولا بيع."
              : filter === "held"
                ? "كل زيتونات هذا العرض متاحة: ما فماش حجز ولا بيع توّا."
                : `ما فماش زيتونات «${filter === "sold" ? labels.sold : labels.reserved}» في هذا العرض.`}
          </EmptyState>
        )}

        <p className="hint">
          الزيتونة تولّي «{labels.reserved}» ولا «{labels.sold}» كي تتعطى لحريف، والحجز يتعمل من{" "}
          <Link href="/admin/leads" className="font-semibold text-forest underline underline-offset-4">
            ملفّ الحريف
          </Link>{" "}
          — غادي فمّا الشخص والمطلب والعدد اللي طلبو. هنا نرجّعو الزيتونة للبيع برك.
        </p>

        {/* The agricultural manager: numbers the stock, and is the one reader who sees the list and no button. */}
        {canManage && !canRelease && held.length > 0 ? (
          <p className="hint">
            تحرير زيتونة محجوزة ما ينجّمش يتعمل بدورك: الزيتونة مربوطة بملفّ حريف، وقاعدة البيانات تحبّ دور المالية ولا
            الإدارة. اطلب منهم يحرّروها.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function PageLink({
  projectId,
  filter,
  page,
  disabled,
  label,
}: {
  projectId: string;
  filter: TreeFilter;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return (
      <span aria-disabled="true" className="btn btn-ghost btn-sm opacity-50">
        {label}
      </span>
    );
  }
  const query = `?tab=trees${filter === "held" ? "" : `&state=${filter}`}${page > 1 ? `&page=${page}` : ""}`;
  return (
    <Link href={`/admin/projects/${projectId}${query}`} className="btn btn-ghost btn-sm">
      {label}
    </Link>
  );
}
