import { supabase } from "./api";

/*
 * ما يقعدش كل مرّة يعمّر — the details a signed-in buyer has already given us.
 *
 * The mirror of src/lib/intake-prefill.ts, and it keeps that file's one rule: THIS IS A CONVENIENCE AND NEVER A
 * GATE. A visitor with no account, a session that expired, a database where 0147 has not been applied and an
 * outage all come back as `null`, and the form reads null as «ask the questions as usual». A form that refused
 * to open because a prefill failed would turn a nicety into a wall in front of a sale.
 *
 * READ WITH THE BUYER'S OWN SESSION. `public.my_intake_prefill()` takes no argument and resolves the person from
 * `auth.uid()`, so the session `src/auth.tsx` hands to the Supabase client is the whole authorisation — there is
 * nowhere to put a request for somebody else's details. The function is revoked from `anon`.
 *
 * ONLY WHAT THIS FORM ASKS. The function also returns a WhatsApp number, an e-mail, how the buyer likes to be
 * called and when; the app's form asks none of those (its endpoint takes eight keys), so they are not carried.
 */

export type IntakePrefill = {
  personId: string;
  fullName: string | null;
  /** AS THE FIELD WANTS IT TYPED — see `typedPhone`. */
  phone: string | null;
  governorateId: number | null;
  /** How many requests this buyer has already sent, for «مع اللي بعثتهم قبل». */
  requests: number;
};

/**
 * A stored E.164 number as a person types it: «+21690000001» → «90 000 001».
 *
 * persons.phone_e164 holds the international form, and the field under which it lands says «8 أرقام». Worse
 * than ugly: `lead.allow_international_phone` is off on the live site, so «+216…» would be read as an
 * international number and refused after the buyer had answered everything. A Tunisian number goes back to the
 * shape the field asks for; a foreign one stays international. src/lib/phone.ts's `formatPhone`, for the one
 * case this form can meet.
 */
export function typedPhone(e164: string): string {
  const digits = e164.replace(/[^0-9]/g, "");
  if (e164.startsWith("+216") && digits.length === 11) {
    const local = digits.slice(3);
    return `${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
  }
  return e164;
}

const text = (row: Record<string, unknown>, key: string) =>
  typeof row[key] === "string" && row[key] !== "" ? (row[key] as string) : null;

const whole = (row: Record<string, unknown>, key: string) =>
  typeof row[key] === "number" && Number.isFinite(row[key]) ? (row[key] as number) : null;

/** The buyer's own details, or null — which every caller reads as «ask the questions as usual». */
export async function fetchIntakePrefill(): Promise<IntakePrefill | null> {
  try {
    const { data, error } = await supabase.rpc("my_intake_prefill");
    if (error || !data || typeof data !== "object") return null;

    const row = data as Record<string, unknown>;
    const personId = text(row, "person_id");
    if (!personId) return null;

    const phone = text(row, "phone_e164");
    return {
      personId,
      fullName: text(row, "full_name"),
      phone: phone ? typedPhone(phone) : null,
      governorateId: whole(row, "governorate_id"),
      requests: whole(row, "requests") ?? 0,
    };
  } catch {
    return null;
  }
}
