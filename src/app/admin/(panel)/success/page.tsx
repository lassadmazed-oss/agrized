import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState, SectionHeader, StatTile } from "@/components/ui";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { CONSENT_LABELS, STATUS_LABELS, type StoryList, type StoryListItem } from "./story-model";

export const metadata: Metadata = { title: "قصص النجاح" };

/**
 * «قصص النجاح» (0176, owner 2026-11-19: «تخرج لنا قصة حقيقية بعباتها بناسها، مش كان أرقام»). Every client with
 * something for a story — what he sent, whether he allowed publishing, where the montage stands — and the
 * clients worth asking: a deposit paid or a contract, and nothing sent yet.
 */

const FILTERS = [
  { key: "all", label: "الكل" },
  { key: "video", label: "فيها فيديو" },
  { key: "consent", label: "قبلو النشر" },
  { key: "editing", label: "في المونتاج" },
  { key: "published", label: "تنشرت" },
] as const;

type Rpc = (fn: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

function keep(item: StoryListItem, filter: string): boolean {
  if (filter === "video") return item.videos > 0;
  if (filter === "consent") return item.consent === "granted";
  if (filter === "editing") return item.status === "editing" || item.status === "ready";
  if (filter === "published") return item.status === "published";
  return true;
}

export default async function SuccessStoriesPage({ searchParams }: PageProps<"/admin/success">) {
  await requireStaff(CRM_READ_ROLES);
  const params = await searchParams;
  const filter = typeof params.filter === "string" ? params.filter : "all";
  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase)("staff_success_stories");
  if (error) console.error("staff_success_stories failed", error.message);
  const list = (data ?? { stories: [], to_ask: [] }) as StoryList;
  const shown = list.stories.filter((item) => keep(item, filter));

  return (
    <div className="space-y-8">
      <SectionHeader
        as="h1"
        level={1}
        title="قصص النجاح"
        description="كل حريف عندو قصة معانا: من أوّل طلب حتى زيتونتو. هوني التصاور والفيديوات اللي بعثهم هو ولا الفريق، موافقتو على النشر، ووين وصل المونتاج."
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="قصص" value={formatCount(list.stories.length)} emphasis />
        <StatTile label="فيها فيديو" value={formatCount(list.stories.filter((item) => item.videos > 0).length)} />
        <StatTile label="قبلو النشر" value={formatCount(list.stories.filter((item) => item.consent === "granted").length)} />
        <StatTile label="تنشرت" value={formatCount(list.stories.filter((item) => item.status === "published").length)} />
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="فلتر القصص">
        {FILTERS.map((item) => (
          <Link key={item.key} href={item.key === "all" ? "/admin/success" : `/admin/success?filter=${item.key}`} aria-current={filter === item.key ? "true" : undefined} className="chip">
            {item.label}
          </Link>
        ))}
      </nav>

      {shown.length === 0 ? (
        <EmptyState>
          {list.stories.length === 0
            ? "مازال حتى حريف ما بعث تصويرة ولا فيديو. الحرفاء يبعثو من «زيتونتي ← قصّتي»، والكوميرسيال يصوّر من التابلات نهار الزيارة."
            : "ما فمّا حتى قصة في الفلتر هذا."}
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((item) => (
            <li key={item.person.id}>
              <Link href={`/admin/success/${item.person.id}`} className="card block h-full space-y-2 p-4 transition-colors hover:border-forest">
                <span className="flex items-start justify-between gap-2">
                  <span className="font-bold text-ink">{item.person.full_name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${item.status === "published" ? "bg-forest text-white" : "bg-paper text-forest"}`}>
                    {STATUS_LABELS[item.status]}
                  </span>
                </span>
                {item.title ? <span className="block text-sm text-ink/80">«{item.title}»</span> : null}
                <span className="flex flex-wrap gap-2 text-xs text-muted">
                  <span>📷 {formatCount(item.photos)}</span>
                  <span>🎬 {formatCount(item.videos)}</span>
                  {item.has_final ? <span className="font-semibold text-forest">✂️ المونتاج جاهز</span> : null}
                  <span className={item.consent === "granted" ? "font-semibold text-success" : ""}>
                    {item.consent === "granted" ? "✓ " : ""}
                    {CONSENT_LABELS[item.consent]}
                  </span>
                  {item.stage ? <span>· {item.stage}</span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {list.to_ask.length > 0 ? (
        <section className="space-y-3 border-t border-line pt-6">
          <SectionHeader
            as="h2"
            title="اطلبو منهم قصّتهم"
            description="دفعو عربون ولا عندهم عقد، ومازالو ما بعثو حتى شيء. كلّمهم واطلب فيديو قصير من «زيتونتي ← قصّتي»: علاش اختارو زيتونتهم، مع عايلتهم، في الأرض."
          />
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {list.to_ask.map((item) => {
              const phone = item.person.whatsapp_e164 ?? item.person.phone_e164;
              return (
                <li key={item.person.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                  <Link href={`/admin/success/${item.person.id}`} className="font-semibold text-ink hover:text-forest">
                    {item.person.full_name}
                  </Link>
                  {item.stage ? <span className="text-xs text-muted">{item.stage}</span> : null}
                  <span className="ms-auto flex gap-2">
                    {item.person.phone_e164 ? (
                      <a href={`tel:${item.person.phone_e164}`} className="btn btn-ghost btn-sm">
                        📞
                      </a>
                    ) : null}
                    {phone ? (
                      <a href={`https://wa.me/${phone.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                        💬 واتساب
                      </a>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
