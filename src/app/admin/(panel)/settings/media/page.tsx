import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { clearSlotImage, saveSlotImage } from "./actions";

export const metadata: Metadata = { title: "صور الموقع" };

export default async function MediaPage() {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const { data: slots, error } = await supabase
    .from("site_media")
    .select("slot, label_ar, description_ar, url, alt_ar, aspect, updated_at, editor:profiles!site_media_updated_by_fkey(full_name)")
    .order("group_key")
    .order("sort_order");
  if (error) throw new Error(error.message);

  const filled = (slots ?? []).filter((slot) => slot.url).length;

  return (
    <div className="max-w-4xl space-y-8">
      <header>
        <h1 className="section-title">صور الموقع</h1>
        <p className="mt-2 max-w-2xl leading-7 text-muted">
          كل موضع هنا هو صورة في الصفحة الرئيسية. الصور تُنشر فوراً، ومادام الموضع فارغاً يعرض الموقع رسماً بألوان
          العلامة بدل إطار مكسور.
        </p>
        <p className="mt-3 text-sm font-medium text-forest">
          {filled} من {slots?.length ?? 0} مواضع فيها صورة.
        </p>
      </header>

      <ul className="space-y-4">
        {(slots ?? []).map((slot) => (
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
