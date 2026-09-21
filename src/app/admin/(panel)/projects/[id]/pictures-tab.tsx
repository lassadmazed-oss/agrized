// Tab «الصور»: the gallery of the public offer page, its cover, its order.
// Report v3 §20. Server component; the upload form is the usual client <ActionForm>.

import { ActionForm } from "@/components/admin/action-form";
import { EmptyState, FormField, SectionHeader } from "@/components/ui";

import { addProjectPicture, moveProjectPicture, removeProjectPicture, setProjectCover } from "../actions";

export type OfferPicture = {
  id: string;
  url: string;
  alt_ar: string;
  caption_ar: string | null;
  is_cover: boolean;
  sort_order: number;
};

export function PicturesTab({
  projectId,
  pictures,
  canWrite,
}: {
  projectId: string;
  pictures: readonly OfferPicture[];
  canWrite: boolean;
}) {
  // Without a chosen cover the site uses the first picture in order.
  const hasChosenCover = pictures.some((picture) => picture.is_cover);

  return (
    <div className="space-y-4">
      <SectionHeader title="صور العرض" description="تظهر في صفحة المشروع. الغلاف يظهر أولاً وفي بطاقة المشروع." />

      {pictures.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {pictures.map((picture, index) => {
            const isCover = picture.is_cover || (!hasChosenCover && index === 0);
            return (
              <li key={picture.id} className="card p-2">
                <div className="relative aspect-4/3 overflow-hidden rounded-xl bg-leaf-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element -- admin preview of an uploaded file */}
                  <img src={picture.url} alt={picture.alt_ar} className="size-full object-cover" />
                  {isCover ? (
                    <span className="pill absolute start-2 top-2 bg-forest text-paper">الغلاف</span>
                  ) : null}
                </div>
                <p className="mt-2 px-1 text-sm">{picture.alt_ar}</p>
                {picture.caption_ar ? <p className="px-1 text-xs text-muted">{picture.caption_ar}</p> : null}
                {canWrite ? (
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pb-1 text-sm">
                    {!picture.is_cover ? (
                      <form action={setProjectCover.bind(null, projectId, picture.id)}>
                        <button type="submit" className="font-semibold text-forest underline-offset-4 hover:underline">
                          اجعلها الغلاف
                        </button>
                      </form>
                    ) : null}
                    {index > 0 ? (
                      <form action={moveProjectPicture.bind(null, projectId, picture.id, -1)}>
                        <button type="submit" className="font-medium text-ink/80 underline-offset-4 hover:underline">
                          تقديم
                        </button>
                      </form>
                    ) : null}
                    {index < pictures.length - 1 ? (
                      <form action={moveProjectPicture.bind(null, projectId, picture.id, 1)}>
                        <button type="submit" className="font-medium text-ink/80 underline-offset-4 hover:underline">
                          تأخير
                        </button>
                      </form>
                    ) : null}
                    <form action={removeProjectPicture.bind(null, projectId, picture.id)}>
                      <button type="submit" className="font-medium text-danger underline-offset-4 hover:underline">
                        حذف
                      </button>
                    </form>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>ما فماش صور بعد. ما دام العرض بلا صورة يظهر رسم بألوان العلامة.</EmptyState>
      )}

      {canWrite ? (
        <div className="card p-5">
          <ActionForm
            action={addProjectPicture.bind(null, projectId)}
            submitLabel="رفع الصورة"
            pendingLabel="جارٍ الرفع…"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_auto] lg:items-end"
            buttonClassName="btn btn-secondary btn-sm"
          >
            <FormField size="sm" label="ملف الصورة">
              <input
                name="file"
                type="file"
                required
                accept="image/jpeg,image/png,image/webp,image/avif"
                className="field field-sm file:me-3 file:rounded-lg file:border-0 file:bg-leaf-soft file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-forest"
              />
            </FormField>
            <FormField size="sm" label="النص البديل">
              <input name="alt" required maxLength={160} placeholder="مثال: صفوف زيتون شملالي عند مدخل الضيعة" className="field field-sm" />
            </FormField>
            <FormField size="sm" label="تعليق (اختياري)">
              <input name="caption" maxLength={200} className="field field-sm" />
            </FormField>
          </ActionForm>
        </div>
      ) : null}
    </div>
  );
}
