import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, SectionHeader, StatTile } from "@/components/ui";
import { CRM_READ_ROLES, hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { flagState, getPublicConfig, optionsFor } from "@/lib/config";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { InstallmentBlock, type PaymentMethod } from "./installment-block";
import { FILTER_LABELS, INSTALLMENT_FILTERS, parseFilter, type InstallmentFilter } from "./installment-model";
import { readInstallments } from "./rpc";

export const metadata: Metadata = { title: "الأقساط" };

/**
 * الأقساط — report v3 §29 (Schedule), §30 (طرق الدفع · Reference · Receipt) and §31 (التأخير في الدفع).
 *
 * WHAT IT LEADS WITH. This is Finance's collections screen, so it opens on what is asking to be dealt with,
 * not on a schedule sorted by date: «يلزمها تدخّل» is everything late or closing in, late first. The order is
 * decided in SQL (staff_installments), not here, and the four tiles are the same questions — each one a link
 * into its own filter, so «7 متأخرة» is a way in and not a figure to admire.
 *
 * THE LADDER IS THE DATABASE'S. §31 names two rungs above «Overdue» — Late Payment 1, then Critical / Contract
 * Review — and every threshold between them is a setting: how many days of grace after the date, how many
 * missed instalments raise each rung. Postgres computes the stage on every read, from the clock, and stores it
 * nowhere; this page prints the live numbers under the queue so the rule is visible instead of buried.
 *
 * AND THE SYSTEM DOES NOTHING ELSE. §31 and cahier v2 §36 both refuse automatic termination — «لا يوجد فسخ
 * آلي», «النظام ينبه Legal/Admin». There is no scheduled job in this module: it surfaces a queue, and a human
 * takes the decision the contract allows.
 *
 * ONE CLIENT'S OWN PLAN IS NOT HERE. staff_installments has no per-person argument and there is no per-person
 * twin of it: a client's schedule belongs to their contract, which the contract card on their file links to.
 * A second card restating the same money on the lead page is how two screens start disagreeing.
 *
 * WHY THE SCREEN OPENS WHILE THE MODULE IS OFF. src/app/admin/(panel)/layout.tsx states the rule: the flag
 * says what VISITORS see and is not an access rule for the team — the Back Office is where a module is
 * prepared before it is published. So the page reads and renders with `installments` disabled (the reader
 * itself carries no module gate), says so in one line with a link to the switch, and draws no control the
 * database would refuse. Turning it on is the owner's act and nothing here does it for him.
 *
 * NOTHING ON THIS PAGE IS COMPUTED. The counts, the ordering, what is left on a line, how many days late it is
 * and the Arabic of every status and stage all arrive decided from Postgres.
 */
export default async function InstallmentsPage({ searchParams }: PageProps<"/admin/installments">) {
  const session = await requireStaff(CRM_READ_ROLES);
  const params = await searchParams;
  const filter: InstallmentFilter = parseFilter(params.filter);

  const supabase = await createClient();
  const [config, list, { data: settingRows }] = await Promise.all([
    getPublicConfig(),
    readInstallments(supabase, filter),
    supabase.from("settings").select("key, value").in("key", ["audit.reason_min_length"]),
  ]);

  const reasonValue = (settingRows ?? []).find((row) => row.key === "audit.reason_min_length")?.value;
  const reasonMin = typeof reasonValue === "number" && Number.isFinite(reasonValue) ? reasonValue : 0;

  const state = flagState(config, "installments");
  const moduleOpen = state !== "disabled";
  // app.can_record_money(): recording a receipt is Finance's and Admin's. Reading is wider, and the database
  // narrows every row to app.can_see_person anyway — a commercial sees their own files only.
  const canRecordMoney = hasRole(session, PRICE_ROLES);

  // The methods the owner keeps in الإعدادات ← القوائم, never a list written here. §30 names four channels and
  // defers the fifth («Payment gateway لاحقاً»); this module builds none of it — money arrives, a human records it.
  const methods: PaymentMethod[] = optionsFor(config, "payment_method").map((item) => ({
    id: item.id,
    label: item.label_ar,
  }));

  const href = (key: InstallmentFilter) => `/admin/installments?filter=${key}`;

  return (
    <div className="space-y-4">
      <SectionHeader
        as="h1"
        level={1}
        title="الأقساط والخلاص"
        description="كل قسط: قدّاش، وقتاش، وشنوّة وصل عليه. الترتيب حسب اللي يلزمو تدخّل قبل الكل."
      />

      {state === "disabled" ? (
        <p className="card p-cozy text-sm leading-6">
          <span className="font-semibold">الموديول معطّل.</span> الشاشة هاذي مفتوحة للفريق باش تحضّرها، أما تسجيل
          الخلاص موقّف في قاعدة البيانات روحها. كي تكون جاهز، شغّلو من{" "}
          <Link href="/admin/settings/modules" className="font-semibold underline underline-offset-4">
            الإعدادات ← الموديولات
          </Link>
          : «داخلي فقط» يخلّي الفريق يخدم بيه، و«منشور للعموم» يبان للحرفاء.
        </p>
      ) : null}

      {list === null ? (
        <EmptyState title="ما نجمناش نقرا الأقساط.">
          إذا كانت هذي أول مرة، جداول العقود والأقساط مازالت ما تركّبتش في قاعدة البيانات — المسودّة موجودة في
          supabase/pending/ وتستنى شكون يركّبها. كلّم المسؤول، ومن بعد حدّث الصفحة.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-tight sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label={FILTER_LABELS.critical}
              value={list.counts.critical}
              href={href("critical")}
              emphasis={list.counts.critical > 0}
              quiet={list.counts.critical === 0}
              note={`العقود اللي وصلت لـ${formatCount(list.late2Missed)} قسط ما تخلّصوش (التقرير v3 §31).`}
            />
            <StatTile
              label={FILTER_LABELS.overdue}
              value={list.counts.overdue}
              href={href("overdue")}
              emphasis={list.counts.overdue > 0}
              quiet={list.counts.overdue === 0}
              note={
                list.graceDays > 0
                  ? `فات موعدها بأكثر من ${formatCount(list.graceDays)} يوم وما وصلش الخلاص.`
                  : "فات موعدها وما وصلش الخلاص — ما فماش مهلة تسامح."
              }
            />
            <StatTile
              label={FILTER_LABELS.due_soon}
              value={list.counts.due_soon}
              href={href("due_soon")}
              quiet={list.counts.due_soon === 0}
              note={`باقيلها ${formatCount(list.reminderDays)} أيام ولا أقلّ.`}
            />
            <StatTile
              label={FILTER_LABELS.unpaid}
              value={list.counts.unpaid}
              href={href("unpaid")}
              quiet={list.counts.unpaid === 0}
              note="كل الأقساط اللي مازال عليها باقي، مهما كان موعدها."
            />
          </div>

          <nav aria-label="فرز الأقساط" className="flex flex-wrap gap-tight">
            {INSTALLMENT_FILTERS.map((key) => (
              <Link
                key={key}
                href={href(key)}
                // .chip in globals.css styles the selected one from aria-current="true"; no second class.
                aria-current={key === filter ? "true" : undefined}
                className="chip"
              >
                {FILTER_LABELS[key]}
                <span className="ms-1 tabular-nums text-muted">{formatCount(list.counts[key])}</span>
              </Link>
            ))}
          </nav>

          {/* The rule, in the open. Every number below is a setting the owner edits, and every one of them
              arrives from SQL — a sentence that said «بعد شهرين» would freeze the commercial rule §31 itself
              walked back. */}
          <p className="hint">
            القسط يولّى متأخر{" "}
            {list.graceDays > 0 ? (
              <>
                بعد <span className="tabular-nums">{formatCount(list.graceDays)}</span> يوم من موعدو
              </>
            ) : (
              "غدوة موعدو، بلا مهلة تسامح"
            )}
            ، والعقد يدخل لـ«مراجعة العقد» كي يوصل{" "}
            <span className="tabular-nums">{formatCount(list.late2Missed)}</span> قسط ما تخلّصوش. الحدود هاذي
            تتبدّل من الإعدادات، والنظام ما يلغي حتى عقد وحدو — يعلّم برك، والقرار يرجع للقانوني والإدارة.
          </p>

          {list.rows.length === 0 ? (
            <EmptyState title="ما فماش أقساط في هذا الفرز.">
              جدول الأقساط يتولّد كي يتمضى العقد في وحدة «العقود ووعد البيع». إذا مازال ما فماش عقود، ابدا من
              ملفّ الحريف: حجز، ثم عقد، ثم الأقساط تبان هنا.
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {list.rows.map((row) => (
                <InstallmentBlock
                  key={row.installment.id}
                  row={row}
                  methods={methods}
                  reasonMin={reasonMin}
                  canRecordMoney={canRecordMoney}
                  moduleOpen={moduleOpen}
                />
              ))}
            </div>
          )}

          {list.capped ? (
            <p className="hint">
              نعرضو أول <span className="tabular-nums">{formatCount(list.limit)}</span> قسط برك من{" "}
              <span className="tabular-nums">{formatCount(list.matched)}</span>. ضيّق الفرز باش تشوف البقية.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
