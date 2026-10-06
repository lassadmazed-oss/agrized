import { ActionForm } from "@/components/admin/action-form";
import { ReasonField } from "@/components/admin/reason-field";
import { EmptyState } from "@/components/ui";
import { formatCount, formatMillimes } from "@/lib/format";

import { deletePromotion, savePromotion } from "./actions";
import { ActiveBadge, DeleteForm, Section } from "./fields";
import { NOTE_MAX_LENGTH } from "./types";

/**
 * تخفيض حسب الكمية — the quantity ladder, entirely in the owner's hands (0132).
 *
 * Owner, 2026-10-06: «ما نحبوش المطور يكتب 10 زيتونات = 10% مباشرة في الكود. الإدارة هي اللي تزيد وتبدّل
 * وتمسح». So this screen holds no tier and no number: it lists what is in the table and offers one form to
 * add another. The example ladder he gave — 10 → 10%, 25 → 15%, 100 → 20% — is three rows he types once.
 *
 * THE RULE IS PRINTED ABOVE THE LIST, because a discount nobody can explain is a discount that gets argued
 * about with a client on the telephone. «The highest floor the quantity reaches wins, and an offer's own tier
 * beats one that applies to everything» is the whole of it, and it is decided in SQL (app.promotion_for) —
 * this screen only has to say so.
 *
 * Every row is edited by its own form rather than one giant table: a tier carries nine fields, and nine
 * columns of inputs across a screen is a spreadsheet nobody can read on the laptop this is used on.
 */

export type PromotionRow = {
  id: string;
  label_ar: string;
  project_id: string | null;
  min_trees: number;
  max_trees: number | null;
  discount_percent_bp: number | null;
  unit_price_millimes: number | null;
  payment_mode: string | null;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  note_ar: string | null;
};

export type PromotionProject = { id: string; name: string; code: string };

export function PromotionsSection({
  rows,
  projects,
  reasonMin,
}: {
  rows: PromotionRow[];
  projects: PromotionProject[];
  reasonMin: number;
}) {
  return (
    <Section
      id="promotions"
      title="تخفيض حسب الكمية"
      note={
        <>
          كل سطر هو درجة: «من كذا زيتونة، كذا تخفيض». <strong className="font-semibold text-forest">القاعدة:</strong>{" "}
          الدرجة اللي عتبتها أعلى وعدد الزيتونات يوصلها هي اللي تتطبّق — وتخفيض خاصّ بعرض يغلب تخفيض يخصّ العروض
          الكل. التخفيض يتطبّق على مجموع الطلب، ماشي على سعر الزيتونة الواحدة؛ والقسط الشهري يتحسب على السعر{" "}
          <strong className="font-semibold text-forest">بعد</strong> التخفيض.
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState size="sm">ما فماش تخفيضات. زيد وحدة من التحت — مثال: «من 25 زيتونة» بـ15%.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="card p-4">
              <PromotionForm row={row} projects={projects} reasonMin={reasonMin} />
            </li>
          ))}
        </ul>
      )}

      <div className="card border-dashed p-4">
        <h3 className="mb-3 font-semibold text-forest">زيد تخفيض</h3>
        <PromotionForm row={null} projects={projects} reasonMin={reasonMin} />
      </div>
    </Section>
  );
}

function PromotionForm({
  row,
  projects,
  reasonMin,
}: {
  row: PromotionRow | null;
  projects: PromotionProject[];
  reasonMin: number;
}) {
  const id = row?.id ?? "new";
  const kind = row?.unit_price_millimes !== null && row?.unit_price_millimes !== undefined ? "unit" : "percent";

  return (
    <div className="space-y-3">
      {row ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-ink">{row.label_ar}</p>
            <p className="mt-0.5 text-sm text-muted tabular-nums">
              {/* The tier said back in one line, so the list reads as a ladder without opening anything. */}
              من {formatCount(row.min_trees)} زيتونة
              {row.max_trees !== null ? ` إلى ${formatCount(row.max_trees)}` : ""} ·{" "}
              {row.discount_percent_bp !== null
                ? `${row.discount_percent_bp / 100}%`
                : `${formatMillimes(row.unit_price_millimes ?? 0)} للزيتونة`}
              {" · "}
              {row.project_id ? projects.find((p) => p.id === row.project_id)?.name ?? "عرض محذوف" : "كل العروض"}
              {row.payment_mode === "cash" ? " · بالحاضر فقط" : row.payment_mode === "installments" ? " · بالتقسيط فقط" : ""}
            </p>
          </div>
          <ActiveBadge active={row.is_active} />
        </div>
      ) : null}

      <ActionForm action={savePromotion} submitLabel={row ? "احفظ" : "زيد التخفيض"} className="space-y-3">
        {row ? <input type="hidden" name="id" value={row.id} /> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">اسم التخفيض</span>
            <input name="label_ar" required maxLength={120} defaultValue={row?.label_ar ?? ""} placeholder="من 25 زيتونة" className="field field-sm mt-1" />
          </label>
          <label className="block">
            <span className="label">على أي عرض</span>
            <select name="project_id" defaultValue={row?.project_id ?? ""} className="field field-sm mt-1">
              <option value="">كل العروض</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">من كم زيتونة</span>
            <input name="min_trees" required inputMode="numeric" dir="ltr" defaultValue={row?.min_trees ?? ""} placeholder="25" className="field field-sm mt-1 text-left" />
          </label>
          <label className="block">
            <span className="label">حتى كم زيتونة (اختياري)</span>
            <input name="max_trees" inputMode="numeric" dir="ltr" defaultValue={row?.max_trees ?? ""} placeholder="بلا حدّ" className="field field-sm mt-1 text-left" />
          </label>
        </div>

        {/* One kind per tier: the database refuses both at once, and a form that says so first is a form
            somebody can use without reading an error. */}
        <fieldset className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <label className="block">
            <span className="label">نوع التخفيض</span>
            <select name="kind" defaultValue={kind} className="field field-sm mt-1">
              <option value="percent">نسبة مئوية</option>
              <option value="unit">سعر خاص للزيتونة</option>
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label">النسبة %</span>
              <input
                name="discount_percent"
                inputMode="decimal"
                dir="ltr"
                defaultValue={row?.discount_percent_bp != null ? row.discount_percent_bp / 100 : ""}
                placeholder="15"
                className="field field-sm mt-1 text-left"
              />
            </label>
            <label className="block">
              <span className="label">ولا سعر الزيتونة (د)</span>
              <input
                name="unit_price"
                inputMode="decimal"
                dir="ltr"
                defaultValue={row?.unit_price_millimes != null ? row.unit_price_millimes / 1000 : ""}
                placeholder="4.500"
                className="field field-sm mt-1 text-left"
              />
            </label>
          </div>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="label">طريقة الخلاص</span>
            <select name="payment_mode" defaultValue={row?.payment_mode ?? ""} className="field field-sm mt-1">
              <option value="">بالحاضر وبالتقسيط</option>
              <option value="cash">بالحاضر فقط</option>
              <option value="installments">بالتقسيط فقط</option>
            </select>
          </label>
          <label className="block">
            <span className="label">من تاريخ (اختياري)</span>
            <input type="date" name="starts_on" defaultValue={row?.starts_on ?? ""} className="field field-sm mt-1" />
          </label>
          <label className="block">
            <span className="label">إلى تاريخ (اختياري)</span>
            <input type="date" name="ends_on" defaultValue={row?.ends_on ?? ""} className="field field-sm mt-1" />
          </label>
        </div>

        <label className="block">
          <span className="label">ملاحظة داخلية (اختياري)</span>
          <input name="note_ar" maxLength={NOTE_MAX_LENGTH} defaultValue={row?.note_ar ?? ""} className="field field-sm mt-1" />
        </label>

        <label className="choice items-center">
          <input type="checkbox" name="is_active" defaultChecked={row?.is_active ?? true} />
          <span className="font-semibold">مفعّل</span>
        </label>

        <ReasonField minLength={reasonMin} id={`promo-reason-${id}`} />
      </ActionForm>

      {row ? (
        <DeleteForm
          action={deletePromotion.bind(null, row.id)}
          reasonId={`promo-delete-${row.id}`}
          reasonMin={reasonMin}
          submitLabel="افسخ التخفيض"
          hint={`«${row.label_ar}» يتفسخ. الطلبات اللي تسجّلت قبل ما تتبدّلش — التخفيض محفوظ معاهم.`}
        />
      ) : null}
    </div>
  );
}
