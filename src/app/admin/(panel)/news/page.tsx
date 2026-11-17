import type { Metadata } from "next";

import { ActionForm } from "@/components/admin/action-form";
import { RemotePhoto } from "@/components/site/site-photo";
import { EmptyState, SectionHeader } from "@/components/ui";
import { requireStaff } from "@/lib/auth";
import { getPublicConfig, optionsFor } from "@/lib/config";
import { formatCount, formatDateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { treeNewsPhotoUrl } from "@/lib/tree-news";

import { AGRI_ROLES } from "../agri/agri-model";
import { archiveNews, createNews, publishNews } from "./actions";

export const metadata: Metadata = { title: "أخبار الزيتونات" };

type NewsRow = {
  id: string;
  project_name: string;
  kind_label_ar: string | null;
  title: string;
  body: string | null;
  photo_path: string | null;
  photo_alt: string | null;
  published_at: string | null;
  notified_at: string | null;
  push_sent: number;
  sms_sent: number;
  created_at: string;
};
type OfferRow = { id: string; code: string; name: string; holders: number };

/**
 * أخبار الزيتونات (0167, owner's idea 5: «الحكاية تكمل بعد الشراء»). The grove team posts a photograph and a
 * sentence on an offer — «نوّرت», «بدا الجني», «جات الشتا» — and every client holding trees there reads it in
 * زيتونتي («أخبار زيتونتك»). A post is a draft until it is published; publishing tells the holders once, by push
 * to the app and, when ticked, by SMS. Nothing a post says is computed, priced or promised: it is news.
 */
export default async function NewsPage() {
  await requireStaff(AGRI_ROLES);
  const supabase = await createClient();
  const [config, { data, error }] = await Promise.all([getPublicConfig(), supabase.rpc("staff_tree_news")]);
  if (error) console.error("staff_tree_news failed", error);

  const payload = (data as unknown as { news: NewsRow[]; offers: OfferRow[] } | null) ?? { news: [], offers: [] };
  const kinds = optionsFor(config, "tree_news_kind");

  return (
    <div className="space-y-6">
      <SectionHeader
        as="h1"
        level={1}
        title="أخبار الزيتونات"
        description="صورة وجملة على عرض، يقراها كل حريف عندو زيتون فيه في «زيتونتي»، ويوصلو إشعار كي تنشرها."
      />

      <section className="card p-cozy">
        <h2 className="text-lg font-semibold">خبر جديد</h2>
        <ActionForm action={createNews} submitLabel="سجّل كمسودّة" className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-semibold">العرض</span>
              <select name="project_id" required defaultValue="" className="field field-sm w-full">
                <option value="" disabled>
                  اختار العرض
                </option>
                {payload.offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name} · {formatCount(offer.holders)} حريف
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">نوع الخبر</span>
              <select name="kind_option_id" defaultValue={kinds[0]?.id ?? ""} className="field field-sm w-full">
                {kinds.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-semibold">العنوان</span>
            <input name="title" required maxLength={120} placeholder="زيتونتك نوّرت" className="field field-sm w-full" />
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-semibold">الخبر (اختياري، حتى 600 حرف)</span>
            <textarea name="body" maxLength={600} rows={3} placeholder="الضيعة بيضاء بالنوّار هالأسبوع…" className="field min-h-20 w-full" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-sm font-semibold">الصورة (JPG، PNG، WEBP، حتى 5 ميغا)</span>
              <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="block w-full text-sm" />
            </label>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">وصف الصورة</span>
              <input name="photo_alt" maxLength={200} placeholder="زيتونة منوّرة في الضيعة" className="field field-sm w-full" />
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-semibold">السبب (اختياري)</span>
            <input name="reason" maxLength={1000} className="field field-sm w-full" />
          </label>
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">الأخبار</h2>
        {payload.news.length === 0 ? (
          <EmptyState size="sm">مازال ما تكتب حتى خبر.</EmptyState>
        ) : (
          <ul className="space-y-3">
            {payload.news.map((news) => (
              <li key={news.id} className="card grid gap-4 p-cozy sm:grid-cols-[10rem_1fr]">
                {news.photo_path ? (
                  <RemotePhoto
                    url={treeNewsPhotoUrl(news.photo_path)}
                    alt={news.photo_alt}
                    seed={news.id}
                    sizes="10rem"
                    className="aspect-[4/3] rounded-xl"
                  />
                ) : (
                  <div className="grid aspect-[4/3] place-items-center rounded-xl bg-paper text-xs text-muted">بلا صورة</div>
                )}
                <div className="min-w-0 space-y-2">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    {news.kind_label_ar ? (
                      <span className="rounded-full bg-leaf-soft px-2 py-0.5 font-semibold text-forest">{news.kind_label_ar}</span>
                    ) : null}
                    <span>{news.project_name}</span>
                    <span>·</span>
                    <span>
                      {news.published_at
                        ? `منشور ${formatDateTime(news.published_at)}`
                        : `مسودّة من ${formatDateTime(news.created_at)}`}
                    </span>
                  </p>
                  <p className="font-display text-lg font-bold text-forest">{news.title}</p>
                  {news.body ? <p className="text-sm leading-6">{news.body}</p> : null}
                  {news.notified_at ? (
                    <p className="text-xs text-muted">
                      الإشعار تبعث: {formatCount(news.push_sent)} تلفون، {formatCount(news.sms_sent)} SMS.
                    </p>
                  ) : null}

                  <div className="flex flex-wrap items-start gap-3">
                    {!news.notified_at ? (
                      <ActionForm
                        action={publishNews.bind(null, news.id)}
                        submitLabel={news.published_at ? "ابعث الإشعار" : "انشر وابعث"}
                        buttonClassName="btn btn-primary btn-sm"
                        className="flex flex-wrap items-center gap-3"
                      >
                        <label className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" name="push" defaultChecked /> إشعار في التطبيق
                        </label>
                        <label className="flex items-center gap-1.5 text-sm">
                          <input type="checkbox" name="sms" /> SMS زادا
                        </label>
                      </ActionForm>
                    ) : null}
                    <ActionForm
                      action={archiveNews.bind(null, news.id)}
                      submitLabel="أرشف"
                      buttonClassName="btn btn-secondary btn-sm"
                      className="flex items-center gap-2"
                    >
                      <span className="sr-only">أرشف الخبر</span>
                    </ActionForm>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
