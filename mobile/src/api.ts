import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";

/**
 * Where the app's data comes from, and the one rule that decides which door it uses.
 *
 * READING GOES STRAIGHT TO POSTGRES. `public_projects` and `public_project_page` are granted to `anon`
 * (migration 0030/0044), which is exactly what the anon key is for: they return only what the website already
 * shows a stranger, and every row is filtered inside the function. So the app reads the same offers the site
 * reads, from the same place, with no server in between to go down.
 *
 * WRITING CANNOT. `submit_interest_request` and `submit_offer_request` are granted to `service_role` ALONE —
 * deliberately, because they write a person and a demand and they carry the intake's own protections. The
 * service key must never be in an app: anything shipped to a phone is readable, and that key can read and
 * rewrite every table in the business. So a submission is POSTed to the website, which holds the key on its
 * own server (/api/mobile/interest). The app never sees it.
 *
 * That split is the whole architecture: reads are cheap, public and direct; writes go through one audited
 * endpoint.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** The website, for the one thing the anon key may not do. */
export const siteUrl = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.agrized.site";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Nobody signs in. Without this the client keeps a session it will never have and tries to refresh a
    // token that does not exist, on a timer, forever.
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export type Offer = {
  id: string;
  code: string;
  name: string;
  governorate_id: number;
  location_description: string | null;
  olive_variety: string | null;
  tree_count: number | null;
  tree_age_years: number | null;
  production_status: string | null;
  irrigation: string | null;
  total_area_m2: number | null;
  offered: boolean;
  min_price_per_tree_millimes: number | null;
  area_per_tree_min_m2: number | null;
  cover_url: string | null;
  cover_alt_ar: string | null;
};

export type Governorate = { id: number; name_ar: string };

/** The offers a visitor may see, newest data on every call. */
export async function fetchOffers(): Promise<Offer[]> {
  const { data, error } = await supabase.rpc("public_projects");
  if (error) throw new Error(error.message);
  return ((data ?? []) as Offer[]).filter((offer) => offer.offered);
}

/** The 24 governorates, for turning an id into «صفاقس». */
export async function fetchGovernorates(): Promise<Governorate[]> {
  const { data, error } = await supabase.from("governorates").select("id, name_ar").order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as Governorate[];
}

export type InterestInput = {
  fullName: string;
  phone: string;
  email?: string;
  /** public.governorates.id — the intake requires it, so the form asks for it. */
  governorateId: number;
  /** Why they want trees. A code; the server resolves which option row it is. */
  goal: "family" | "investment" | "both";
  /** The offer this came from, when it came from one. */
  offerCode?: string | null;
  trees?: number | null;
  note?: string | null;
};

export type InterestResult = { ok: true; reference: string | null } | { ok: false; message: string };

/**
 * Sends an interest to the website, which writes it with the service key.
 *
 * The app does not decide whether the data is good — the endpoint validates it again with the same rules the
 * web form uses, because a request from a phone is a request from the internet and nothing on this side of
 * the wire can be trusted by the other.
 */
export async function submitInterest(input: InterestInput): Promise<InterestResult> {
  try {
    const response = await fetch(`${siteUrl}/api/mobile/interest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => null)) as
      | { ok: true; reference?: string | null }
      | { ok: false; message?: string }
      | null;

    if (!payload) return { ok: false, message: "ما وصلتش الإجابة. عاود جرّب." };
    if (payload.ok) return { ok: true, reference: payload.reference ?? null };
    return { ok: false, message: payload.message ?? "ما تعملش التسجيل. عاود جرّب." };
  } catch {
    // A phone loses signal in a grove; that is not an error to dress up as a bug.
    return { ok: false, message: "ما فماش كونيكسيون. تثبّت من الأنترنات وعاود." };
  }
}
