import "server-only";

import { formatPhone } from "@/lib/phone";
import { createClient } from "@/lib/supabase/server";

/*
 * ما يقعدش كل مرّة يعمّر — the details a signed-in buyer has already given us.
 *
 * The owner's words (2026-10-22): a buyer may send a request with no account at all, and that does not
 * change; but one who HAS an account should send from it and not fill his name, his number and how to reach
 * him into every form, every time.
 *
 * THIS IS A CONVENIENCE AND NEVER A GATE. Every caller treats `null` as «we know nothing about this reader»
 * and shows the same form it has always shown. A visitor who is not signed in, a session that has expired, a
 * database where 0147 has not been applied and an outage all come back the same way, on purpose: a form that
 * refused to open because a prefill failed would turn a nicety into a wall in front of a sale.
 *
 * READ WITH THE BUYER'S OWN SESSION, never the admin client. public.my_intake_prefill() takes no argument
 * and resolves the person from auth.uid() through persons.profile_id, so the session IS the authorisation —
 * see 0147's header, and 0102's for the longer argument behind the shape.
 */

export type IntakePrefill = {
  personId: string;
  fullName: string | null;
  /**
   * AS THE FIELD WANTS IT TYPED, not as the database stores it. persons.phone_e164 holds «+21690000001»,
   * and a form whose own hint says «8 أرقام» would show the reader a shape it did not ask for — and then
   * refuse it, because lead.allow_international_phone is off on the live site and «+216…» reads as an
   * international number. formatPhone turns a Tunisian number into «90 000 001», which normalizePhone
   * parses straight back to the same E.164, and leaves a foreign one in its international form.
   */
  phone: string | null;
  whatsapp: string | null;
  /** Whether the account holds a genuinely different WhatsApp number — decided here so both forms agree. */
  whatsappApart: boolean;
  email: string | null;
  governorateId: number | null;
  delegationId: number | null;
  livesAbroad: boolean;
  contactChannel: string | null;
  /** Null when the buyer's last answer has since been retired from the list — 0147 drops it rather than
   *  hand the form a choice the intake would refuse. */
  contactTimeOptionId: string | null;
  /** How many requests this buyer has already sent, for «مع اللي بعثتهم قبل». */
  requests: number;
};

/**
 * THE ONE CAST IN THIS MODULE, and the reason for it.
 *
 * public.my_intake_prefill() is created by 0147, and `npm run db:types` has not run against it — the
 * project's Supabase token expired on 2026-10-11 — so the generated Database type does not carry the name.
 * The untyped surface is named ONCE, here, rather than spread over the call sites: the same shape
 * src/lib/zitounti.ts and src/lib/journey.ts use for their own new surfaces.
 *
 * DELETE THIS once the token is renewed and the types are regenerated; the call below then typechecks
 * against the generated types with no other change, and the compiler points straight at this block.
 */
type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;

const text = (row: Record<string, unknown>, key: string) =>
  typeof row[key] === "string" && row[key] !== "" ? (row[key] as string) : null;

const number = (row: Record<string, unknown>, key: string) =>
  typeof row[key] === "number" && Number.isFinite(row[key]) ? (row[key] as number) : null;

/** The buyer's own details, or null — which every caller reads as «ask the questions as usual». */
export async function readIntakePrefill(): Promise<IntakePrefill | null> {
  try {
    const supabase = await createClient();
    const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
    const { data, error } = await rpc("my_intake_prefill");
    // not_signed_in is the ordinary state of this site: most readers have no account, and that is fine.
    if (error || !data || typeof data !== "object") return null;

    const row = data as Record<string, unknown>;
    const personId = text(row, "person_id");
    if (!personId) return null;

    // Compared as stored, shown as typed: the two numbers are the same number when their E.164 is the same.
    const phone = text(row, "phone_e164");
    const whatsapp = text(row, "whatsapp_e164");
    const apart = Boolean(whatsapp && whatsapp !== phone);

    return {
      personId,
      fullName: text(row, "full_name"),
      phone: phone ? formatPhone(phone) : null,
      whatsapp: apart && whatsapp ? formatPhone(whatsapp) : null,
      whatsappApart: apart,
      email: text(row, "email"),
      governorateId: number(row, "governorate_id"),
      delegationId: number(row, "delegation_id"),
      livesAbroad: row.lives_abroad === true,
      contactChannel: text(row, "contact_channel"),
      contactTimeOptionId: text(row, "contact_time_option_id"),
      requests: number(row, "requests") ?? 0,
    };
  } catch {
    return null;
  }
}
