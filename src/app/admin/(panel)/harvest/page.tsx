// الصابة والجني — the season being picked now, what has come in, and the seasons before it.
// Report v3 §37 (خدمة الجني), cahier v2 §43 (الصابة) and §44 (اختيارات المالك).
//
// GATED, BOTH HALVES. moduleAccess() here and app.module_open('harvest') inside every RPC (see ./actions.ts).
// The flag is 'disabled' and stays disabled until the owner switches it himself, so the card at the top is what
// this page renders today — and that is the correct behaviour, not an unfinished one.
//
// EMPTY IS THE NORMAL STATE. All 8,600 trees are available and nobody owns one, so every list below is written
// to read well with nothing in it: the sentence that says why it is empty and what has to happen first comes
// from settings (harvest.empty_seasons, harvest.empty_owners), never from this file.

import type { Metadata } from "next";
import Link from "next/link";

import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { DataList, DataRow, EmptyState, FormField, SectionHeader, StatTile } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getPublicConfig, optionsFor } from "@/lib/config";
import { formatCount, formatDate } from "@/lib/format";
import { moduleAccess } from "@/lib/modules";

import { saveOfferHarvestOptions, saveSeason } from "./actions";
import { loadHarvestCopy } from "./copy";
import { ModuleClosedCard, SeasonPill, quantityText } from "./parts";
import { harvestRpc, type HarvestOverview } from "./rpc";

export async function generateMetadata(): Promise<Metadata> {
  const { text } = await loadHarvestCopy();
  return { title: text("harvest.page_title") };
}

export default async function HarvestPage() {
  await requireStaff();
  const [config, copy] = await Promise.all([getPublicConfig(), loadHarvestCopy()]);
  const { text, reasonMin } = copy;
  const access = await moduleAccess(config, "harvest");

  const header = (
    <SectionHeader level={1} title={text("harvest.page_title")} description={text("harvest.page_intro")} />
  );

  if (access === "closed") {
    return (
      <div className="space-y-6">
        {header}
        <ModuleClosedCard title={text("harvest.page_title")} />
      </div>
    );
  }

  const { data, error } = await harvestRpc<HarvestOverview>("staff_harvest_overview", { p_project: null });
  if (error) throw new Error(error.message);

  const overview: HarvestOverview = data ?? { current: null, seasons: [], offers: [], can_price: false, can_manage: false };
  const { current, seasons, offers, can_manage: canManage } = overview;
  const kg = text("harvest.unit_olives");
  const litres = text("harvest.unit_oil");

  const pickOptions = optionsFor(config, "harvest_pick");
  const outcomeOptions = optionsFor(config, "harvest_outcome");

  return (
    <div className="space-y-8">
      {header}

      {/* الموسم الجاري — what is being picked right now, or nothing at all. */}
      {current ? (
        <section className="space-y-3" aria-labelledby="current-season">
          <SectionHeader
            id="current-season"
            title={current.label_ar}
            description={`${current.project_name} · ${current.project_code}`}
            badge={<SeasonPill status={current.status} label={current.status_label_ar} />}
            actions={
              <Link href={`/admin/harvest/${current.id}`} className="btn btn-secondary">
                افتح الموسم
              </Link>
            }
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="الصابة" value={quantityText(current.olives_kg, kg)} note="الكمية اللي دخلت من الضيعة الكل" />
            <StatTile label="الزيت" value={quantityText(current.oil_litres, litres)} note="بعد العصر" />
            <StatTile
              label="الزيتونات اللي تجنّات"
              value={current.trees_harvested === null ? "—" : formatCount(current.trees_harvested)}
              note="هو المقسوم عليه في حصّة كل مالك"
              emphasis={current.trees_harvested === null}
            />
            <StatTile
              label="الملّاك"
              value={current.holders}
              note={`${formatCount(current.trees_owned)} زيتونة مباعة`}
              quiet={current.holders === 0}
            />
          </div>
          {current.choice_closed ? <p className="text-sm text-muted">{text("harvest.choice_closed_note")}</p> : null}
        </section>
      ) : null}

      {/* المواسم الكل */}
      <section className="space-y-3" aria-labelledby="all-seasons">
        <SectionHeader id="all-seasons" title="المواسم" description="كل موسم صابة مسجّل، من الأحدث للأقدم." />
        {seasons.length === 0 ? (
          <EmptyState>{text("harvest.empty_seasons")}</EmptyState>
        ) : (
          <ul className="panel divide-y divide-line">
            {seasons.map((season) => (
              <li key={season.id}>
                <Link
                  href={`/admin/harvest/${season.id}`}
                  className="flex flex-wrap items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-leaf-soft/40"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{season.label_ar}</span>
                      <SeasonPill status={season.status} label={season.status_label_ar} />
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {season.project_name} · <span dir="ltr">{season.project_code}</span>
                    </p>
                  </div>
                  <DataList variant="grid" columns={3} className="w-full text-sm sm:w-auto sm:min-w-80">
                    <DataRow layout="stacked" size="sm" label="الصابة">
                      {quantityText(season.olives_kg, kg)}
                    </DataRow>
                    <DataRow layout="stacked" size="sm" label="الزيت">
                      {quantityText(season.oil_litres, litres)}
                    </DataRow>
                    <DataRow layout="stacked" size="sm" label="الحصص">
                      {season.status === "settled" ? formatCount(season.shares_written) : "—"}
                    </DataRow>
                  </DataList>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* موسم جديد */}
      {canManage ? (
        <section className="space-y-3" aria-labelledby="new-season">
          <SectionHeader
            id="new-season"
            title="موسم جديد"
            description="موسم واحد في كل عرض في كل سنة. السنة هي اللي يبدا فيها الجني: موسم أكتوبر 2026 سنته 2026."
          />
          <div className="card p-5">
            <ActionForm action={saveSeason.bind(null, null)} submitLabel="سجّل الموسم" className="grid gap-4 sm:grid-cols-2">
              <FormField label="العرض" id="new-season-project">
                <select id="new-season-project" name="project_id" required defaultValue="" className="field">
                  <option value="" disabled>
                    اختر العرض
                  </option>
                  {offers.map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.name} — {offer.code}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="السنة" id="new-season-year" hint="أربعة أرقام، مثال: 2026.">
                <input
                  id="new-season-year"
                  name="season_year"
                  type="number"
                  min={2000}
                  max={2100}
                  step={1}
                  inputMode="numeric"
                  required
                  className="field"
                />
              </FormField>
              <FormField
                label="اسم الموسم"
                id="new-season-label"
                hint="اتركه فارغاً باش يتسمّى وحده حسب الإعداد (مثال: موسم 2026/2027)."
                className="sm:col-span-2"
              >
                <input id="new-season-label" name="label_ar" type="text" maxLength={80} className="field" />
              </FormField>
              <ReasonField minLength={reasonMin} className="sm:col-span-2" />
            </ActionForm>
          </div>
        </section>
      ) : null}

      {/* الجني في العروض — §37: «النظام لازم يبقى Configurable حسب المشروع» */}
      <section className="space-y-3" aria-labelledby="offer-choices">
        <SectionHeader
          id="offer-choices"
          title="الجني في العروض"
          description="كل عرض يحدّد شنوّة ينجم المالك يختار وقت الصابة، وشنوّة يمشي كي ما يجاوبش قبل آخر أجل."
        />
        {offers.length === 0 ? (
          <EmptyState size="sm">ما فماش عروض. زيد عرضاً من صفحة العروض أولاً.</EmptyState>
        ) : (
          <div className="space-y-4">
            {offers.map((offer) => (
              <div key={offer.id} className="card p-5">
                <SectionHeader
                  level={3}
                  title={offer.name}
                  description={
                    <span>
                      <span dir="ltr">{offer.code}</span> · {formatCount(offer.trees_owned)} زيتونة مباعة ·{" "}
                      {formatCount(offer.seasons)} موسم
                    </span>
                  }
                />
                {canManage ? (
                  <ActionForm
                    action={saveOfferHarvestOptions.bind(null, offer.id)}
                    submitLabel="احفظ اختيارات هذا العرض"
                    className="mt-4 space-y-5"
                    buttonClassName="btn btn-secondary"
                  >
                    <ChoiceGroup
                      legend="شكون يجني"
                      hint="الاختيارات اللي يوفّرها هذا العرض للمالك (التقرير v3 §37)."
                      name="pick_ids"
                      defaultName="pick_default"
                      options={pickOptions}
                      selected={offer.pick_option_ids}
                      defaultId={offer.pick_default_id}
                      idPrefix={`pick-${offer.id}`}
                    />
                    <ChoiceGroup
                      legend="مصير المحصول"
                      hint="شنوّة يصير في الزيتون بعد الجني (كراس الشروط v2 §44)."
                      name="outcome_ids"
                      defaultName="outcome_default"
                      options={outcomeOptions}
                      selected={offer.outcome_option_ids}
                      defaultId={offer.outcome_default_id}
                      idPrefix={`outcome-${offer.id}`}
                    />
                    <ReasonField minLength={reasonMin} />
                  </ActionForm>
                ) : (
                  <DataList variant="grid" columns={2} className="mt-4 text-sm">
                    <DataRow layout="stacked" size="sm" numeric={false} label="شكون يجني">
                      {labelsOf(pickOptions, offer.pick_option_ids) || "—"}
                    </DataRow>
                    <DataRow layout="stacked" size="sm" numeric={false} label="مصير المحصول">
                      {labelsOf(outcomeOptions, offer.outcome_option_ids) || "—"}
                    </DataRow>
                  </DataList>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {current?.ended_on ? (
        <p className="text-sm text-muted">آخر جني تسجّل يوم {formatDate(current.ended_on)}.</p>
      ) : null}
    </div>
  );
}

type Option = { id: string; label_ar: string };

function labelsOf(options: Option[], ids: string[]): string {
  return options
    .filter((option) => ids.includes(option.id))
    .map((option) => option.label_ar)
    .join(" · ");
}

/**
 * One allow-list: the options this offer offers, and which of them stands for an owner who never answered.
 * The list itself is option_items — the owner edits it in الإعدادات ← القوائم — so nothing here names a choice.
 */
function ChoiceGroup({
  legend,
  hint,
  name,
  defaultName,
  options,
  selected,
  defaultId,
  idPrefix,
}: {
  legend: string;
  hint: string;
  name: string;
  defaultName: string;
  options: Option[];
  selected: string[];
  defaultId: string | null;
  idPrefix: string;
}) {
  if (options.length === 0) {
    return (
      <EmptyState size="sm">
        ما فماش اختيارات في القائمة. زيدهم من الإعدادات ← القوائم قبل ما تحدّد شنوّة يوفّر هذا العرض.
      </EmptyState>
    );
  }

  return (
    <fieldset className="space-y-2">
      <legend className="label">{legend}</legend>
      <p className="hint">{hint}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => (
          <label key={option.id} className="choice">
            <input type="checkbox" name={name} value={option.id} defaultChecked={selected.includes(option.id)} />
            <span>{option.label_ar}</span>
          </label>
        ))}
      </div>
      <FormField
        label="الاختيار الافتراضي"
        id={`${idPrefix}-default`}
        size="sm"
        hint="يمشي على المالك اللي ما جاوبش قبل آخر أجل، ويتسجّل «تلقائي». لازم يكون من الاختيارات المؤشّرة فوق."
      >
        <select id={`${idPrefix}-default`} name={defaultName} defaultValue={defaultId ?? ""} className="field field-sm">
          <option value="">بلا اختيار افتراضي</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label_ar}
            </option>
          ))}
        </select>
      </FormField>
    </fieldset>
  );
}
