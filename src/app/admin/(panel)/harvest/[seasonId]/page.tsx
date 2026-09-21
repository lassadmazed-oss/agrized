// One harvest season: the nine facts v2 §43 names, and what each owner takes out of it.
//
// FROM THE SEASON TO THE TREE. A season is one weighing of a whole grove; an owner's figure is an allocation of
// it — حصّتك = صابة الموسم × عدد زيتوناتك ÷ عدد الزيتونات اللي تجنّات — computed in Postgres by one function
// (app.harvest_allocate) both before and after settlement, so the estimate and the frozen share can never
// disagree. Every figure on this page carries the Arabic sentence that explains it (settings harvest.share_note
// / harvest.share_estimate_note): the product must not claim a precision nobody measured.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { DataList, DataRow, EmptyState, FormField, SectionHeader, StatTile, StatusPill } from "@/components/ui";
import { hasRole, PRICE_ROLES, requireStaff } from "@/lib/auth";
import { getPublicConfig, optionsFor } from "@/lib/config";
import { formatCount, formatDate, formatDateTime, formatMillimes } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";

import { saveSeason, saveSeasonMoney, setHarvestChoice, setSeasonStatus, settleSeason } from "../actions";
import { loadHarvestCopy } from "../copy";
import { ModuleClosedCard, SeasonPill, quantityText } from "../parts";
import { FILE_ROLES, GROVE_ROLES, NEXT_STATUSES } from "../roles";
import { harvestRpc, type HarvestSeasonDetail, type HarvestShareRow } from "../rpc";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await loadHarvestCopy();
  return { title: text("harvest.page_title") };
}

/** Dinars in the box, millimes in the column. Empty stays empty: «not recorded» is not «zero». */
function dinars(millimes: number | null | undefined): string {
  if (millimes === null || millimes === undefined) return "";
  return String(millimes / 1000);
}

export default async function HarvestSeasonPage({ params }: { params: Promise<{ seasonId: string }> }) {
  const session = await requireStaff();
  const { seasonId } = await params;
  const [config, copy] = await Promise.all([getPublicConfig(), loadHarvestCopy()]);
  const { text, reasonMin } = copy;

  if ((await moduleAccess(config, "harvest")) === "closed") {
    return (
      <div className="space-y-6">
        <SectionHeader level={1} title={text("harvest.page_title")} />
        <ModuleClosedCard title={text("harvest.page_title")} />
      </div>
    );
  }

  const { data: season, error } = await harvestRpc<HarvestSeasonDetail>("staff_harvest_season", { p_season: seasonId });
  if (error && error.message === "invalid_harvest_season") notFound();
  if (error) throw new Error(error.message);
  if (!season) notFound();

  const kg = text("harvest.unit_olives");
  const litres = text("harvest.unit_oil");
  const canManage = hasRole(session, GROVE_ROLES);
  const canPrice = hasRole(session, PRICE_ROLES);
  const canWriteChoice = hasRole(session, FILE_ROLES);
  const editable = season.status !== "settled";
  const owners: HarvestShareRow[] = season.settled ? season.shares : season.estimates;
  const nextStatuses = NEXT_STATUSES[season.status] ?? [];

  const pickOptions = optionsFor(config, "harvest_pick");
  const outcomeOptions = optionsFor(config, "harvest_outcome");

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/harvest" className="text-sm text-muted hover:text-forest">
          ← {text("harvest.page_title")}
        </Link>
        <SectionHeader
          level={1}
          className="mt-2"
          title={season.label_ar}
          description={
            <span>
              {season.project_name} · <span dir="ltr">{season.project_code}</span>
            </span>
          }
          badge={<SeasonPill status={season.status} label={season.status_label_ar} />}
        />
      </div>

      {/* الأرقام الكبيرة: what came in, and what it is divided by. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="الصابة الحقيقية" value={quantityText(season.olives_kg, kg)} note="الكمية اللي دخلت من الضيعة الكل" />
        <StatTile label="الزيت" value={quantityText(season.oil_litres, litres)} note="بعد العصر" />
        <StatTile
          label="الزيتونات اللي تجنّات"
          value={season.trees_harvested === null ? "—" : formatCount(season.trees_harvested)}
          note="المقسوم عليه في حصّة كل مالك"
          emphasis={season.trees_harvested === null}
        />
        <StatTile
          label="الملّاك"
          value={season.holders}
          note={
            season.trees_declared === null
              ? `${formatCount(season.trees_owned)} زيتونة مباعة`
              : `${formatCount(season.trees_owned)} زيتونة مباعة من ${formatCount(season.trees_declared)}`
          }
          quiet={season.holders === 0}
        />
      </div>

      {/* حالة الموسم + التوزيع */}
      <section className="card space-y-4 p-5">
        <SectionHeader
          level={3}
          title="حالة الموسم"
          description="المسار: مبرمج ← في الجني ← تكمّل الجني ← توزيع الحصص. التوزيع يثبّت الأرقام وما عادش الموسم يتبدّل."
        />
        {season.settled ? (
          <p className="text-sm text-muted">
            توزّعت الحصص {season.settled_at ? `يوم ${formatDateTime(season.settled_at)}` : ""} على{" "}
            {formatCount(season.shares_written)} مالك. الأرقام مثبّتة.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {canManage && nextStatuses.length > 0 ? (
              <ActionForm
                action={setSeasonStatus.bind(null, season.id)}
                submitLabel="بدّل الحالة"
                buttonClassName="btn btn-secondary"
              >
                <FormField label="الحالة الجديدة" id="season-status">
                  <select id="season-status" name="status" defaultValue={nextStatuses[0]} className="field">
                    {nextStatuses.map((status) => (
                      <option key={status} value={status}>
                        {text(`harvest.status_${status}`)}
                      </option>
                    ))}
                  </select>
                </FormField>
                <ReasonField minLength={reasonMin} />
              </ActionForm>
            ) : null}

            {canPrice ? (
              <ActionForm action={settleSeason.bind(null, season.id)} submitLabel="وزّع الحصص">
                <p className="text-sm text-muted">
                  {season.can_settle
                    ? "الموسم جاهز: الكمية مسجّلة وعدد الزيتونات اللي تجنّات معروف. التوزيع يكتب حصّة كل مالك ويثبّتها."
                    : "باش توزّع الحصص لازم الموسم يكون في حالة «تكمّل الجني»، وفيه الكمية الحقيقية وعدد الزيتونات اللي تجنّات."}
                </p>
                <ReasonField minLength={reasonMin} />
              </ActionForm>
            ) : null}
          </div>
        )}
      </section>

      {/* التواريخ والكميات — v2 §43 */}
      <section className="card space-y-4 p-5">
        <SectionHeader
          level={3}
          title="ما صار في الموسم"
          description="الكميات بالكيلو والزيت باللتر. كمية فارغة معناها ما تسجّلتش، موش صفر."
        />
        {canManage && editable ? (
          <ActionForm action={saveSeason.bind(null, season.id)} submitLabel="احفظ" className="grid gap-4 sm:grid-cols-2">
            <FormField label="بداية الجني" id="started-on">
              <input id="started-on" name="started_on" type="date" defaultValue={season.started_on ?? ""} className="field" />
            </FormField>
            <FormField label="نهاية الجني" id="ended-on">
              <input id="ended-on" name="ended_on" type="date" defaultValue={season.ended_on ?? ""} className="field" />
            </FormField>
            <FormField
              label="آخر أجل لاختيار المالك"
              id="choice-deadline"
              hint="بعد هذا التاريخ، الاختيار الافتراضي متاع العرض هو اللي يمشي، ويتسجّل «تلقائي». فارغ = الباب ما يسكّرش وحده."
              className="sm:col-span-2"
            >
              <input
                id="choice-deadline"
                name="choice_deadline"
                type="date"
                defaultValue={season.choice_deadline ?? ""}
                className="field"
              />
            </FormField>
            <FormField
              label="الزيتونات اللي تجنّات"
              id="trees-harvested"
              hint="عدد الزيتونات اللي تجنّات فعلاً في هذا العرض — موش عدد المباعة. هو المقسوم عليه في حصّة كل مالك."
              className="sm:col-span-2"
            >
              <input
                id="trees-harvested"
                name="trees_harvested"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                defaultValue={season.trees_harvested ?? ""}
                className="field"
              />
            </FormField>

            <QuantityField id="estimated" name="estimated_olives_kg" label="الكمية المقدّرة" unit={kg} value={season.estimated_olives_kg} hint="تقدير الفريق قبل الجني. ما يتقسّمش على الملّاك." />
            <QuantityField id="actual" name="olives_kg" label="الكمية الحقيقية" unit={kg} value={season.olives_kg} hint="اللي تجنّى فعلاً. هو المقسوم في حصّة كل مالك." />
            <QuantityField id="pressed" name="pressed_olives_kg" label="اللي تعصر" unit={kg} value={season.pressed_olives_kg} />
            <QuantityField id="oil" name="oil_litres" label="الزيت" unit={litres} value={season.oil_litres} />
            <QuantityField id="stored" name="stored_oil_litres" label="الزيت المخزّن" unit={litres} value={season.stored_oil_litres} />
            <QuantityField id="sold-kg" name="sold_olives_kg" label="الزيتون اللي تباع" unit={kg} value={season.sold_olives_kg} />
            <QuantityField id="sold-oil" name="sold_oil_litres" label="الزيت اللي تباع" unit={litres} value={season.sold_oil_litres} />

            <FormField label="ملاحظة" id="season-note" className="sm:col-span-2">
              <textarea id="season-note" name="note" rows={2} maxLength={2000} defaultValue={season.note ?? ""} className="field" />
            </FormField>
            <ReasonField minLength={reasonMin} className="sm:col-span-2" />
          </ActionForm>
        ) : (
          <DataList variant="grid" columns={3} className="text-sm">
            <DataRow layout="stacked" size="sm" label="بداية الجني">
              {season.started_on ? formatDate(season.started_on) : "—"}
            </DataRow>
            <DataRow layout="stacked" size="sm" label="نهاية الجني">
              {season.ended_on ? formatDate(season.ended_on) : "—"}
            </DataRow>
            <DataRow layout="stacked" size="sm" label="آخر أجل للاختيار">
              {season.choice_deadline ? formatDate(season.choice_deadline) : "—"}
            </DataRow>
            <DataRow layout="stacked" size="sm" label="الكمية المقدّرة">
              {quantityText(season.estimated_olives_kg, kg)}
            </DataRow>
            <DataRow layout="stacked" size="sm" label="الكمية الحقيقية">
              {quantityText(season.olives_kg, kg)}
            </DataRow>
            <DataRow layout="stacked" size="sm" label="اللي تعصر">
              {quantityText(season.pressed_olives_kg, kg)}
            </DataRow>
            <DataRow layout="stacked" size="sm" label="الزيت">
              {quantityText(season.oil_litres, litres)}
            </DataRow>
            <DataRow layout="stacked" size="sm" label="الزيت المخزّن">
              {quantityText(season.stored_oil_litres, litres)}
            </DataRow>
            <DataRow layout="stacked" size="sm" label="اللي تباع">
              {quantityText(season.sold_olives_kg, kg)} / {quantityText(season.sold_oil_litres, litres)}
            </DataRow>
          </DataList>
        )}
        {season.note && !(canManage && editable) ? <p className="text-sm text-muted">{season.note}</p> : null}
      </section>

      {/* المال — Finance and Admin only, and the payload carries it for nobody else (§53). */}
      {canPrice ? (
        <section className="card space-y-4 p-5">
          <SectionHeader
            level={3}
            title="تكلفة الجني وثمن البيع"
            description="يشوفها فريق المالية والإدارة برك."
            badge={<StatusPill tone="warning">المالية</StatusPill>}
          />
          {editable ? (
            <ActionForm action={saveSeasonMoney.bind(null, season.id)} submitLabel="احفظ" className="grid gap-4 sm:grid-cols-2">
              <FormField label="تكلفة الجني (د.ت)" id="harvest-cost">
                <input
                  id="harvest-cost"
                  name="harvest_cost"
                  type="text"
                  inputMode="decimal"
                  defaultValue={dinars(season.harvest_cost_millimes)}
                  className="field"
                />
              </FormField>
              <FormField label="ثمن البيع (د.ت)" id="sale-amount" hint="كي AgriZed تتكفل ببيع المحصول.">
                <input
                  id="sale-amount"
                  name="sale_amount"
                  type="text"
                  inputMode="decimal"
                  defaultValue={dinars(season.sale_amount_millimes)}
                  className="field"
                />
              </FormField>
              <ReasonField minLength={reasonMin} className="sm:col-span-2" />
            </ActionForm>
          ) : (
            <DataList variant="grid" columns={2} className="text-sm">
              {/* Zero is a figure somebody recorded; «—» is a figure nobody has. They must not read the same. */}
              <DataRow layout="stacked" size="sm" label="تكلفة الجني">
                {season.harvest_cost_millimes == null ? "—" : formatMillimes(season.harvest_cost_millimes)}
              </DataRow>
              <DataRow layout="stacked" size="sm" label="ثمن البيع">
                {season.sale_amount_millimes == null ? "—" : formatMillimes(season.sale_amount_millimes)}
              </DataRow>
            </DataList>
          )}
        </section>
      ) : null}

      {/* الملّاك: حصّة كل واحد واختياره */}
      <section className="space-y-3" aria-labelledby="owners">
        <SectionHeader
          id="owners"
          title="حصص الملّاك"
          description={
            season.settled
              ? "أرقام مثبّتة يوم التوزيع: عدد الزيتونات والمقسوم عليه محفوظين مع الحصّة، وما يتعاودش حسابهم."
              : "أرقام تقديرية حسب الزيتونات المباعة اليوم. تتثبّت وقت توزيع الحصص."
          }
          badge={
            season.choice_closed && !season.settled ? <StatusPill tone="warning">باب الاختيار تسكّر</StatusPill> : undefined
          }
        />
        {season.choice_closed && !season.settled ? (
          <p className="text-sm text-muted">{text("harvest.choice_closed_note")}</p>
        ) : null}

        {owners.length === 0 ? (
          <EmptyState>{text("harvest.empty_owners")}</EmptyState>
        ) : (
          <ul className="space-y-3">
            {owners.map((owner) => (
              <li key={owner.person_id} className="card space-y-3 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/admin/leads/${owner.person_id}`} className="font-semibold hover:text-forest">
                      {owner.person_name}
                    </Link>
                    <p className="mt-0.5 text-sm text-muted">{formatCount(owner.trees_held)} زيتونة</p>
                  </div>
                  {owner.choice_source === "auto" ? (
                    <StatusPill tone="neutral">{text("harvest.auto_choice_label")}</StatusPill>
                  ) : null}
                </div>

                <DataList variant="grid" columns={4} className="text-sm">
                  <DataRow layout="stacked" size="sm" label="حصّته من الزيتون">
                    {quantityText(owner.olives_kg, kg)}
                  </DataRow>
                  <DataRow layout="stacked" size="sm" label="حصّته من الزيت">
                    {quantityText(owner.oil_litres, litres)}
                  </DataRow>
                  <DataRow layout="stacked" size="sm" numeric={false} label="شكون يجني">
                    {owner.pick_label_ar ?? text("harvest.no_choice_label")}
                  </DataRow>
                  <DataRow layout="stacked" size="sm" numeric={false} label="مصير المحصول">
                    {owner.outcome_label_ar ?? text("harvest.no_choice_label")}
                  </DataRow>
                </DataList>

                {/* The one Arabic sentence that says what the figure is, and what it is not. */}
                {owner.note_ar ? <p className="text-xs leading-6 text-muted">{owner.note_ar}</p> : null}

                {canWriteChoice && !season.settled ? (
                  <details className="border-t border-line pt-3">
                    <summary className="cursor-pointer text-sm font-semibold">سجّل اختيار المالك</summary>
                    <ActionForm
                      action={setHarvestChoice.bind(null, season.id, owner.person_id)}
                      submitLabel="احفظ الاختيار"
                      className="mt-3 grid gap-3 sm:grid-cols-2"
                      buttonClassName="btn btn-secondary"
                    >
                      <FormField label="شكون يجني" id={`pick-${owner.person_id}`} size="sm">
                        <select id={`pick-${owner.person_id}`} name="pick_option_id" defaultValue="" className="field field-sm">
                          <option value="">بلا تغيير</option>
                          {pickOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label_ar}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="مصير المحصول" id={`outcome-${owner.person_id}`} size="sm">
                        <select
                          id={`outcome-${owner.person_id}`}
                          name="outcome_option_id"
                          defaultValue=""
                          className="field field-sm"
                        >
                          <option value="">بلا تغيير</option>
                          {outcomeOptions.map((option) => (
                            <option key={option.id} value={option.id}>
                              {option.label_ar}
                            </option>
                          ))}
                        </select>
                      </FormField>
                      <FormField label="ملاحظة" id={`choice-note-${owner.person_id}`} size="sm" className="sm:col-span-2">
                        <input
                          id={`choice-note-${owner.person_id}`}
                          name="note"
                          type="text"
                          maxLength={1000}
                          className="field field-sm"
                        />
                      </FormField>
                      <ReasonField minLength={reasonMin} className="sm:col-span-2" />
                    </ActionForm>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** One weighed quantity, with the unit word from settings beside its label. */
function QuantityField({
  id,
  name,
  label,
  unit,
  value,
  hint,
}: {
  id: string;
  name: string;
  label: string;
  unit: string;
  value: number | null;
  hint?: string;
}) {
  return (
    <FormField label={unit ? `${label} (${unit})` : label} id={`q-${id}`} hint={hint}>
      <input
        id={`q-${id}`}
        name={name}
        type="text"
        inputMode="decimal"
        defaultValue={value ?? ""}
        className="field"
      />
    </FormField>
  );
}
