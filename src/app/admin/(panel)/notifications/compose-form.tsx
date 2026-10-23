"use client";

import { useActionState, useState } from "react";

import type { ActionResult } from "@/components/admin/action-form";
import { PUSH_AUDIENCES, PUSH_ROUTES, type PushAudience } from "@/lib/backoffice/push-campaigns";

/**
 * The form that writes one notification, with a picture of how it will look on the phone beside it.
 *
 * THE SAFE CHOICE IS THE DEFAULT. «آخر جهاز فتح التطبيق» is selected when the page opens: it sends to the phone
 * that has just opened the app — the owner's own — so the quickest thing to do here, test a message, can never
 * reach a buyer by accident. The three audiences that DO reach buyers ask for a tick first, and the server
 * refuses them without it (actions.ts), so removing the checkbox from this page would not remove the check.
 *
 * THE PREVIEW IS HONEST ABOUT THE LIMITS. A lock screen shows a title on one line and a body of two or three;
 * the counters say how much of each there is room for, and the preview cuts the text where a phone would.
 */

const TITLE_MAX = 60;
const BODY_MAX = 240;

/** `YYYY-MM-DDTHH:mm` for the field, in Tunisian wall-clock time, an hour from now. */
function tunisInAnHour(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(Date.now() + 3_600_000));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function ComposeForm({
  action,
  offers,
  pushEnabled,
}: {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  offers: { code: string; name: string }[];
  pushEnabled: boolean;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [route, setRoute] = useState("");
  const [audience, setAudience] = useState<PushAudience>("latest");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [later, setLater] = useState("");
  const [confirm, setConfirm] = useState(false);

  // A sent message empties the form: leaving it filled invites sending it twice. Done in the action itself, once
  // the server has said yes, rather than in an effect watching for the answer.
  const [state, formAction, pending] = useActionState(async (previous: ActionResult, formData: FormData) => {
    const result = await action(previous, formData);
    if (result?.ok) {
      setTitle("");
      setBody("");
      setConfirm(false);
    }
    return result;
  }, null);

  const choice = PUSH_AUDIENCES.find((entry) => entry.value === audience);
  const broadcast = Boolean(choice?.broadcast);

  const submitLabel = when === "later" ? "برمج الإشعار" : audience === "latest" ? "جرّب على تلفوني" : "ابعث الإشعار";

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="flex items-baseline justify-between text-sm font-semibold">
            العنوان
            <span dir="ltr" className={`text-xs font-normal tabular-nums ${title.length > TITLE_MAX - 8 ? "text-danger" : "text-muted"}`}>
              {title.length} / {TITLE_MAX}
            </span>
          </span>
          <input
            name="title"
            required
            maxLength={TITLE_MAX}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="field w-full"
            placeholder="مثال: عرض جديد في صفاقس"
          />
        </label>

        <label className="block space-y-1">
          <span className="flex items-baseline justify-between text-sm font-semibold">
            النصّ
            <span dir="ltr" className={`text-xs font-normal tabular-nums ${body.length > BODY_MAX - 20 ? "text-danger" : "text-muted"}`}>
              {body.length} / {BODY_MAX}
            </span>
          </span>
          <textarea
            name="body"
            required
            rows={3}
            maxLength={BODY_MAX}
            value={body}
            onChange={(event) => setBody(event.target.value)}
            className="field w-full"
            placeholder="جملة أو جملتين. الشاشة المقفولة يقراها كل من يمسك التلفون، فما تكتبش أرقام ولا معلومات شخصية."
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-semibold">كي يضغط عليه، يفتح</span>
            <select name="route" value={route} onChange={(event) => setRoute(event.target.value)} className="field w-full">
              {PUSH_ROUTES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </select>
          </label>

          {route === "offer" ? (
            <label className="block space-y-1">
              <span className="text-sm font-semibold">العرض</span>
              <select name="offer_code" required defaultValue="" className="field w-full">
                <option value="" disabled>
                  اختار عرض…
                </option>
                {offers.map((offer) => (
                  <option key={offer.code} value={offer.code}>
                    {offer.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">لمن يتبعث؟</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {PUSH_AUDIENCES.map((entry) => (
              <label
                key={entry.value}
                className={`card flex cursor-pointer items-start gap-2 p-3 text-sm ${audience === entry.value ? "border-forest" : ""}`}
              >
                <input
                  type="radio"
                  name="audience"
                  value={entry.value}
                  checked={audience === entry.value}
                  onChange={() => setAudience(entry.value)}
                  className="mt-1"
                />
                <span>
                  <span className="block font-semibold">{entry.label}</span>
                  <span className="block text-xs text-muted">{entry.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {audience === "phone" ? (
          <label className="block space-y-1">
            <span className="text-sm font-semibold">رقم التلفون</span>
            <input name="phone" required inputMode="tel" dir="ltr" className="field w-full sm:max-w-xs" placeholder="98 123 456" />
          </label>
        ) : null}

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">وقتاش؟</legend>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} />
              توّا
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="when"
                value="later"
                checked={when === "later"}
                onChange={() => {
                  setWhen("later");
                  if (!later) setLater(tunisInAnHour());
                }}
              />
              في وقت محدّد
            </label>
            {when === "later" ? (
              <input
                type="datetime-local"
                name="scheduled_local"
                required
                value={later}
                onChange={(event) => setLater(event.target.value)}
                className="field field-sm"
                dir="ltr"
              />
            ) : null}
          </div>
          {when === "later" ? (
            <p className="text-xs text-muted">
              بتوقيت تونس. يخرج كي يعيّط الـscheduler على <span dir="ltr">/api/notifications/dispatch</span> بعد الوقت هذا،
              فالتأخير بقدّ الفرق بين مرّتين يعيّط فيهم.
            </p>
          ) : null}
        </fieldset>

        {broadcast ? (
          <label className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm">
            <input
              type="checkbox"
              name="confirm"
              checked={confirm}
              onChange={(event) => setConfirm(event.target.checked)}
              className="mt-1"
            />
            <span>
              <span className="block font-semibold text-danger">يوصل لناس حقيقيين.</span>
              <span className="block text-muted">
                الإشعار هذا ما يتلغاش بعد ما يخرج. علّم هنا باش تتأكّد إنك راجعت العنوان والنصّ.
              </span>
            </span>
          </label>
        ) : null}

        {!pushEnabled ? (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            الإشعارات مطفية في الإعدادات (<span dir="ltr">push.enabled</span>). الإشعار يتسجّل ويستنّى، وما يخرجش حتى تشعل
            المفتاح.
          </p>
        ) : null}

        {state ? (
          <p role={state.ok ? "status" : "alert"} className={`text-sm font-medium ${state.ok ? "text-success" : "text-danger"}`}>
            {state.message}
          </p>
        ) : null}

        <button type="submit" disabled={pending || (broadcast && !confirm)} className="btn btn-primary">
          {pending ? "جارٍ الإرسال…" : submitLabel}
        </button>
      </div>

      {/* How it looks on a lock screen. `line-clamp` is where a phone cuts the text, so the owner sees what a
          reader will see rather than what he typed. */}
      <aside aria-label="معاينة" className="space-y-2 lg:sticky lg:top-4 lg:self-start">
        <p className="text-sm font-semibold">المعاينة</p>
        <div className="rounded-2xl border border-line bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span aria-hidden className="inline-block size-4 rounded bg-forest" />
            <span>AgriZed</span>
            <span aria-hidden>·</span>
            <span>توّا</span>
          </div>
          <p className="mt-2 line-clamp-1 font-semibold text-ink">{title || "عنوان الإشعار"}</p>
          <p className="mt-0.5 line-clamp-3 text-sm leading-6 text-muted">{body || "نصّ الإشعار يظهر هنا كيما باش يشوفو الحريف."}</p>
        </div>
        <p className="text-xs leading-5 text-muted">
          العنوان في سطر وحد والنصّ في 3 أسطر على الأكثر. شاشة التلفون المقفولة يقراها كل من يمسكو.
        </p>
      </aside>
    </form>
  );
}
