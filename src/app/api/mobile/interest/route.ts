import { headers } from "next/headers";
import { z } from "zod";

import { getPublicConfig, settingBool, settingText } from "@/lib/config";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { getPublicProjects } from "@/lib/public-projects";
import { auditHeaders, clientIp, hashIp } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * The one thing the mobile app cannot do for itself.
 *
 * WHY THIS ENDPOINT EXISTS. `submit_interest_request` and `submit_offer_request` are granted to `service_role`
 * and to nothing else — on purpose: they write a person and a demand. The service key can read and rewrite
 * every table in the business, and anything shipped inside an app is readable by anyone who installs it, so
 * the key can never go to a phone. The app therefore posts here, and this server — which already holds the
 * key for the website's own forms — makes the call.
 *
 * IT DOES NOT TRUST THE APP. Every rule the web form applies is applied again: the name's length, the phone
 * through the same `normalizePhone` the intake uses, and the offer code checked against the offers that are
 * actually open right now. A request from an app is a request from the internet; the validation in the app is
 * there to answer the visitor quickly, not to be believed here.
 *
 * WHAT IT DELIBERATELY DOES NOT ACCEPT. No price, no payment plan, no consent text chosen by the caller. The
 * plan is priced by the database and the consent wording is the owner's setting — a field a client could set
 * is a field a client could lie about. What the app may send is a name, a number, a governorate, optionally
 * which offer, and a free note: facts about the person, never anything that decides money or meaning.
 *
 * The governorate is required because BOTH intake functions require it («اختر ولايتك من القائمة»), and it is
 * checked against public.governorates here — so an invented id is answered with a sentence the app can show
 * rather than with a database error the visitor would see as a crash.
 *
 * THE CONSENT IS RECORDED AS THE SAME SENTENCE the website records, read from `legal.consent_text`, because a
 * demand that cannot say what its author agreed to is a demand nobody can act on.
 */

export const dynamic = "force-dynamic";

const schema = z.object({
  fullName: z.string().trim().min(3, "الاسم قصير برشة.").max(120, "الاسم طويل برشة."),
  phone: z.string().trim().min(6, "رقم التلفون موش صحيح.").max(24, "رقم التلفون طويل برشة."),
  // Required by both intake functions, and checked against the real table below rather than trusted.
  governorateId: z.number("إختار ولايتك.").int().positive("إختار ولايتك."),
  /**
   * Why they want olive trees. A CODE, never an option id: the app sends «family», the server looks up which
   * row that is today. An id from a client is an id a client could swap for another list's.
   */
  goal: z.enum(["family", "investment", "both"], "إختار علاش تحب زياتين."),
  email: z.string().trim().email("الإيميل موش صحيح.").max(160).optional().or(z.literal("")),
  /** The offer this came from, when the visitor was looking at one. */
  offerCode: z.string().trim().max(50).nullish(),
  trees: z.number().int().positive().max(100_000, "عدد الزيتونات كبير برشة.").nullish(),
  note: z.string().trim().max(500, "الملاحظة طويلة برشة.").nullish(),
});

function fail(message: string, status = 400) {
  return Response.json({ ok: false, message }, { status });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "المعطيات موش كاملة.");
  }
  const input = parsed.data;

  const config = await getPublicConfig();

  // A governorate the caller invented is refused here rather than deep inside the RPC, so the app gets a
  // sentence it can show instead of a database error code.
  if (!config.governorates.some((row) => row.id === input.governorateId)) {
    return fail("إختار ولايتك من القائمة.");
  }

  const phone = normalizePhone(input.phone, settingBool(config, "lead.allow_international_phone"));
  if (!phone.ok) {
    return fail(
      phone.reason === "not_tunisian" ? "الرقم لازم يكون تونسي." : "رقم التلفون موش صحيح. مثال: 98 123 456.",
    );
  }

  // The offer, resolved from the code against what is OPEN — not from an id the caller chose. A closed or
  // invented offer becomes a general interest rather than a refusal: the person is real either way, and
  // losing them over a stale code in an app that was left open overnight would be the wrong trade.
  let projectId: string | null = null;
  if (input.offerCode) {
    const offers = await getPublicProjects("anon");
    projectId = offers.find((offer) => offer.offered && offer.code === input.offerCode)?.id ?? null;
  }

  const requestHeaders = await headers();
  const supabase = createAdminClient(auditHeaders(requestHeaders));

  // The goal, resolved from the owner's own list. If the row has been renamed or retired the request is
  // refused rather than written against a guess.
  const { data: goalRow } = await supabase
    .from("option_items")
    .select("id")
    .eq("list_key", "goal")
    .eq("code", input.goal)
    .eq("is_active", true)
    .maybeSingle();
  if (!goalRow?.id) return fail("ما نجّمناش نقرا سبب الاهتمام. عاود جرّب.", 503);
  const consentText = settingText(config, "legal.consent_text", "موافقة على التواصل ومعالجة المعطيات");
  const ipHash = hashIp(clientIp(requestHeaders));
  const source = { channel: "mobile", app: "agrized-expo" };

  const payload = projectId
    ? {
        fn: "submit_offer_request" as const,
        p: {
          project_id: projectId,
          // The offer intake wants a tree count; one is the smallest honest answer when the app did not ask.
          trees: String(input.trees ?? 1),
          full_name: input.fullName,
          phone_e164: phone.e164,
          whatsapp_e164: phone.e164,
          email: input.email || undefined,
          residence_governorate_id: input.governorateId,
          goal_option_id: goalRow.id,
          // The intake prices every request that has not discussed financing as cash — that is the RPC's own
          // default, not a preference this app invented. What the client will actually pay is agreed on the
          // call and written on the contract.
          payment_mode: "cash",
          // One number was collected and it reaches them both ways; «both» is what that is called here.
          contact_channel: "both",
          consent_text: consentText,
          ip_hash: ipHash,
          source,
        },
      }
    : {
        fn: "submit_interest_request" as const,
        p: {
          full_name: input.fullName,
          phone_e164: phone.e164,
          whatsapp_e164: phone.e164,
          email: input.email || undefined,
          residence_governorate_id: input.governorateId,
          // «المكان غير مهم» — the intake insists on knowing WHERE they want to invest, and the app does not
          // ask: a second governorate question doubles a form whose whole virtue is being short. This is the
          // product's own option for «no preference stated», which is exactly the truth about someone who was
          // never asked. It is not a preference invented on their behalf — the call that follows asks it.
          invest_anywhere: true,
          goal_option_id: goalRow.id,
          payment_mode: "cash",
          contact_channel: "both",
          consent_text: consentText,
          ip_hash: ipHash,
          source,
        },
      };

  const { data, error } = await supabase.rpc(payload.fn, { p: payload.p as never });

  if (error) {
    if (!isKnownIntakeError(error.message)) {
      console.error(`${payload.fn} failed (mobile)`, error);
    }
    return fail(intakeErrorMessage(error.message), 400);
  }

  const reference = (data as { request_no?: string } | null)?.request_no ?? null;
  if (!reference) {
    console.error(`${payload.fn} returned no request number (mobile)`, data);
    return fail(intakeErrorMessage(null), 502);
  }

  return Response.json({ ok: true, reference });
}
