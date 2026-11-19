import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { StoryUploader } from "@/components/admin/story-uploader";
import { CRM_READ_ROLES, requireStaff } from "@/lib/auth";
import { formatCount, formatDate, formatDateTime } from "@/lib/format";
import { signStoryReads } from "@/lib/story-media";
import { createClient } from "@/lib/supabase/server";

import { recordStoryConsent, saveStoryText, setStoryStatus } from "../actions";
import { MediaTile } from "../media-tile";
import { CONSENT_LABELS, MILESTONE_LABELS, STATUS_LABELS, storyError, type StoryFile, type StoryStatus } from "../story-model";

export const metadata: Metadata = { title: "قصة الحريف" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STEPS: StoryStatus[] = ["collecting", "editing", "ready", "published"];

type Rpc = (fn: string, args: object) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

/**
 * «قصة الحريف»: his road with us as moments, then everything that happened; what he and the team sent; his
 * permission; the story the montage will tell; the montage itself; and where it was published.
 */
export default async function SuccessStoryPage({ params }: PageProps<"/admin/success/[personId]">) {
  await requireStaff(CRM_READ_ROLES);
  const { personId } = await params;
  if (!UUID.test(personId)) notFound();

  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase)("staff_success_story", { p_person: personId });
  if (error || !data) {
    return (
      <div className="card p-5 leading-7">
        <p className="font-semibold text-ink">ما نجمناش نحلّو القصة.</p>
        <p className="text-sm text-muted">{storyError(error?.message)}</p>
      </div>
    );
  }
  const file = data as StoryFile;
  const reads = await signStoryReads(file.media.map(({ id, path, parts }) => ({ id, path, parts })));
  const finals = file.media.filter((item) => item.role === "final");
  const raws = file.media.filter((item) => item.role === "raw");
  const story = file.story;
  const granted = story.consent === "granted";
  const stepIndex = STEPS.indexOf(story.status);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <Link href="/admin/success" className="text-sm font-semibold text-forest">
            → قصص النجاح
          </Link>
          <h1 className="font-display text-3xl font-bold text-forest">{file.person.full_name}</h1>
          <p className="text-sm text-muted">
            {[file.stage?.label, file.person.governorate, file.trees.map((item) => `${formatCount(item.count)} زيتونة في ${item.offer}`).join("، ")]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/leads/${file.person.id}`} className="btn btn-secondary btn-sm">
            ملف الحريف
          </Link>
          {file.person.phone_e164 ? (
            <a href={`tel:${file.person.phone_e164}`} className="btn btn-ghost btn-sm">
              📞
            </a>
          ) : null}
        </div>
      </header>

      {/* The permission comes first: nothing below can be published without it. */}
      <section className={`card space-y-3 p-5 ${granted ? "border-success/40" : "border-gold/50"}`}>
        <h2 className="text-lg font-bold text-forest">
          {granted ? "✓ " : ""}الموافقة على النشر: {CONSENT_LABELS[story.consent]}
        </h2>
        {story.consent_at ? (
          <p className="text-sm leading-6 text-ink/80">
            {story.consent_source === "client" ? "من «زيتونتي» بيدّو" : "سجّلها الفريق"} · {formatDateTime(story.consent_at)}
            {story.consent_text ? <span className="block text-muted">النص اللي قبلو: «{story.consent_text}»</span> : null}
            {story.consent_note ? <span className="block text-muted">كيفاش: {story.consent_note}</span> : null}
          </p>
        ) : (
          <p className="text-sm text-muted">الحريف ينجم يقبل من «زيتونتي ← قصّتي». ولا سجّل هوني موافقة عطاهالك بورقة ولا بواتساب.</p>
        )}
        {file.can_edit ? (
          granted ? (
            <ActionForm action={recordStoryConsent} submitLabel="نحّي الموافقة" buttonClassName="btn btn-ghost btn-sm text-danger" className="space-y-2">
              <input type="hidden" name="person_id" value={file.person.id} />
              <input type="hidden" name="granted" value="0" />
            </ActionForm>
          ) : (
            <ActionForm action={recordStoryConsent} submitLabel="سجّل موافقتو" buttonClassName="btn btn-secondary btn-sm" className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="person_id" value={file.person.id} />
              <input type="hidden" name="granted" value="1" />
              <label className="min-w-64 flex-1 space-y-1">
                <span className="text-sm font-semibold">كيفاش عطاك الموافقة؟</span>
                <input name="note" required minLength={5} maxLength={300} placeholder="مثلاً: ورقة ممضية نهار الزيارة / رسالة واتساب 19/11" className="field field-sm" />
              </label>
            </ActionForm>
          )
        ) : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-forest">المرحلة</h2>
        <ol className="flex flex-wrap gap-2">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className={`rounded-full px-3 py-1 text-sm font-semibold ${
                story.status === step ? "bg-forest text-white" : index < stepIndex ? "bg-leaf-soft text-forest" : "bg-paper text-muted"
              }`}
            >
              {index + 1}. {STATUS_LABELS[step]}
            </li>
          ))}
          {story.status === "withdrawn" ? <li className="rounded-full bg-danger/10 px-3 py-1 text-sm font-semibold text-danger">{STATUS_LABELS.withdrawn}</li> : null}
        </ol>
        {story.published_url ? (
          <p className="text-sm">
            تنشرت {story.published_at ? formatDate(story.published_at) : ""}:{" "}
            <a href={story.published_url} target="_blank" rel="noreferrer" dir="ltr" className="font-semibold text-forest underline underline-offset-4">
              {story.published_url}
            </a>
          </p>
        ) : null}
        {file.can_edit ? (
          <div className="flex flex-wrap items-start gap-2">
            {story.status !== "editing" ? <StatusButton personId={file.person.id} status="editing" label="✂️ في المونتاج" /> : null}
            {story.status !== "ready" && granted ? <StatusButton personId={file.person.id} status="ready" label="✅ جاهزة للنشر" /> : null}
            {story.status !== "collecting" ? <StatusButton personId={file.person.id} status="collecting" label="↩ رجّعها نجمعو" /> : null}
            {file.can_publish && granted ? (
              <ActionForm action={setStoryStatus} submitLabel="📢 تنشرت" buttonClassName="btn btn-primary btn-sm" className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="person_id" value={file.person.id} />
                <input type="hidden" name="status" value="published" />
                <input name="published_url" dir="ltr" defaultValue={story.published_url ?? ""} placeholder="https://www.facebook.com/…" className="field field-sm w-72" />
              </ActionForm>
            ) : null}
          </div>
        ) : null}
        {!granted ? <p className="text-xs text-muted">«جاهزة للنشر» و«تنشرت» يبانو كي يقبل الحريف.</p> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-forest">القصة اللي باش نحكيوها</h2>
        <p className="text-sm text-muted">العنوان، وشنوّا يحكي الفيديو: هذا اللي يقراه شكون باش يعمل المونتاج. كلامو هو، من غير وعد بربح.</p>
        <ActionForm action={saveStoryText} submitLabel="سجّل" className="card space-y-3 p-4">
          <input type="hidden" name="person_id" value={file.person.id} />
          <input name="title" maxLength={120} defaultValue={story.title ?? ""} placeholder="مثلاً: من سوسة لزيتونتو في بوعرادة" disabled={!file.can_edit} className="field field-sm" />
          <textarea name="story_text" maxLength={4000} rows={6} defaultValue={story.story_text ?? ""} disabled={!file.can_edit} className="field min-h-36 leading-7" />
        </ActionForm>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-forest">✂️ المونتاج النهائي</h2>
        {finals.length === 0 ? <p className="text-sm text-muted">كي يكمل المونتاج، ارفع الفيديو النهائي هوني.</p> : null}
        <div className="grid gap-3 md:grid-cols-2">
          {finals.map((item) => (
            <MediaTile key={item.id} personId={file.person.id} personName={file.person.full_name} item={item} urls={reads.get(item.id) ?? []} canEdit={file.can_edit} />
          ))}
        </div>
        {file.can_edit ? <StoryUploader personId={file.person.id} role="final" label="⬆ ارفع الفيديو النهائي" /> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-forest">
          التصاور والفيديوات <span className="tabular-nums text-muted">{formatCount(raws.length)}</span>
        </h2>
        {raws.length === 0 ? <p className="text-sm text-muted">مازال حتى شيء. الحريف يبعث من «زيتونتي ← قصّتي»، والفريق من هوني ولا من التابلات.</p> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {raws.map((item) => (
            <MediaTile key={item.id} personId={file.person.id} personName={file.person.full_name} item={item} urls={reads.get(item.id) ?? []} canEdit={file.can_edit} />
          ))}
        </div>
        {file.can_edit ? <StoryUploader personId={file.person.id} role="raw" label="⬆ زيد تصاور ولا فيديو" /> : null}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-forest">الطريق</h2>
        {file.milestones.length === 0 ? (
          <p className="text-sm text-muted">ما فمّا حتى محطة مسجّلة.</p>
        ) : (
          <ol className="relative space-y-3 border-s-2 border-leaf-soft ps-5">
            {file.milestones.map((step) => (
              <li key={step.key} className="relative">
                <span className="absolute -start-[1.72rem] top-1.5 size-3 rounded-full bg-forest ring-4 ring-paper" aria-hidden="true" />
                <p className="font-semibold text-ink">{MILESTONE_LABELS[step.key] ?? step.key}</p>
                <p className="text-xs text-muted">
                  {formatDate(step.at)}
                  {step.detail ? ` · ${step.detail}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
        <details className="rounded-2xl border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer text-sm font-semibold text-forest">
            كل اللي صار معاه ({formatCount(file.timeline.total)})
          </summary>
          <ul className="mt-3 space-y-2 text-sm">
            {[...file.timeline.events].reverse().map((event, index) => (
              <li key={`${event.at}-${index}`} className="leading-6">
                <span className="text-xs text-muted">{formatDateTime(event.at)}</span> · <span className="font-semibold">{event.title}</span>
                {event.detail ? <span className="text-ink/80"> — {event.detail}</span> : null}
                {event.by ? <span className="text-xs text-muted"> · {event.by}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      </section>
    </div>
  );
}

function StatusButton({ personId, status, label }: { personId: string; status: StoryStatus; label: string }) {
  return (
    <ActionForm action={setStoryStatus} submitLabel={label} buttonClassName="btn btn-secondary btn-sm" className="space-y-1">
      <input type="hidden" name="person_id" value={personId} />
      <input type="hidden" name="status" value={status} />
    </ActionForm>
  );
}
