import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { clearSlotImage, saveSlotImage, setSlotInCover } from "./actions";

export const metadata: Metadata = { title: "صور الموقع" };

/**
 * The form the cover checkbox posts to. A plain <form action> needs a function taking FormData, and
 * `setSlotInCover` takes (slot, boolean) so it can also be called from anywhere else — this is the adapter,
 * not a second implementation. Every rule still lives in SQL.
 */
async function toggleSlotCover(formData: FormData) {
  "use server";
  const slot = String(formData.get("slot") ?? "");
  await setSlotInCover(slot, formData.get("next") === "on");
}

export default async function MediaPage() {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const { data: slots, error } = await supabase
    .from("site_media")
    .select("*, editor:profiles!site_media_updated_by_fkey(full_name)")
    .order("group_key")
    .order("sort_order");
  if (error) throw new Error(error.message);

  const rows = slots ?? [];
  const filled = rows.filter((slot) => slot.url).length;

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <h1 className="section-title">صور الموقع</h1>
        <p className="mt-2 max-w-2xl leading-7 text-muted">
          كل موضع هنا هو صورة في الصفحة الرئيسية. الصور تُنشر فوراً، ومادام الموضع فارغاً يعرض الموقع رسماً بألوان
          العلامة بدل إطار مكسور.
        </p>
        <p className="mt-3 text-sm font-medium text-forest">
          {filled} من {rows.length} مواضع فيها صورة.
        </p>
      </header>

      <ul className="space-y-4">
        {rows.map((slot) => (
          <li key={slot.slot} className="card p-5">
            <div className="grid gap-5 sm:grid-cols-[12rem_1fr]">
              <div>
                <div
                  style={{ aspectRatio: slot.aspect.replace("/", " / ") }}
                  className="grid w-full place-items-center overflow-hidden rounded-xl border border-line bg-leaf-soft"
                >
                  {slot.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- admin preview of an arbitrary uploaded file
                    <img src={slot.url} alt={slot.alt_ar ?? ""} className="size-full object-cover" />
                  ) : (
                    <span className="text-xs font-medium text-forest/60">بلا صورة</span>
                  )}
                </div>
                <p dir="ltr" className="mt-2 text-center font-mono text-[0.7rem] text-muted">
                  {slot.slot} · {slot.aspect}
                </p>
              </div>

              <div>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="font-semibold">{slot.label_ar}</h2>
                    {slot.description_ar ? <p className="mt-0.5 text-sm text-muted">{slot.description_ar}</p> : null}
                  </div>
                  <p className="text-xs text-muted tabular-nums">
                    {formatDateTime(slot.updated_at)}
                    {slot.editor?.full_name ? ` · ${slot.editor.full_name}` : ""}
                  </p>
                </div>

                <ActionForm
                  action={saveSlotImage.bind(null, slot.slot)}
                  submitLabel={slot.url ? "حفظ" : "رفع الصورة"}
                  pendingLabel="جارٍ الرفع…"
                  className="mt-4 space-y-3"
                  buttonClassName="btn btn-secondary min-h-10"
                >
                  <div>
                    <label htmlFor={`file-${slot.slot}`} className="label">
                      ملف الصورة
                    </label>
                    <input
                      id={`file-${slot.slot}`}
                      name="file"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/avif"
                      className="field py-2.5 file:me-3 file:rounded-lg file:border-0 file:bg-leaf-soft file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-forest"
                    />
                    <p className="hint mt-1.5">JPG أو PNG أو WEBP أو AVIF، 5 ميغا كحد أقصى. اتركه فارغاً لتغيير النص فقط.</p>
                  </div>
                  <div>
                    <label htmlFor={`alt-${slot.slot}`} className="label">
                      النص البديل
                    </label>
                    <input
                      id={`alt-${slot.slot}`}
                      name="alt"
                      type="text"
                      maxLength={160}
                      defaultValue={slot.alt_ar ?? ""}
                      placeholder="مثال: غابة زيتون في الساحل التونسي عند الغروب"
                      className="field"
                    />
                  </div>
                </ActionForm>

                {/* THE SLIDING COVER (owner, 2026-10-03). Which pictures rotate on the home page was an
                    array in the source until today; it is this control now. Only offered on a slot that
                    HAS a picture, because the database refuses an empty one (media_slot_empty) and a
                    control that always fails is a lie. The order they rotate in is the order of this
                    list — there is no second ordering to keep in step with it. */}
                {slot.url ? (
                  <form action={toggleSlotCover} className="mt-4 flex items-center gap-2 border-t border-line pt-3">
                    <input type="hidden" name="slot" value={slot.slot} />
                    <input type="hidden" name="next" value={slot.in_cover ? "off" : "on"} />
                    <button
                      type="submit"
                      className={`chip gap-2 ${slot.in_cover ? "border-transparent bg-forest text-surface" : ""}`}
                    >
                      <span aria-hidden="true">{slot.in_cover ? "✓" : "+"}</span>
                      {slot.in_cover ? "في شريط الغلاف" : "زيدها لشريط الغلاف"}
                    </button>
                    <span className="text-xs text-muted">
                      {slot.in_cover ? "تدور في واجهة الصفحة الرئيسية" : "ما تدورش في الواجهة"}
                    </span>
                  </form>
                ) : null}

                {slot.url ? (
                  <form action={clearSlotImage.bind(null, slot.slot)} className="mt-3">
                    <button type="submit" className="text-sm font-medium text-danger underline-offset-4 hover:underline">
                      إزالة الصورة
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
