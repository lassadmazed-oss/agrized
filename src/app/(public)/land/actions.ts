"use server";

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { getStaffSession } from "@/lib/auth";
import { flagState, getPublicConfig, settingBool, settingInt, settingText } from "@/lib/config";
import { intakeErrorMessage, isKnownIntakeError } from "@/lib/errors";
import { normalizePhone } from "@/lib/phone";
import { auditHeaders, clientIp, hashIp } from "@/lib/request-context";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchAfterResponse } from "@/lib/sms";
import { LAND_OFFER_BUCKET } from "@/lib/supabase/storage-upload";

const FILE_EXTENSIONS = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;

const fileSchema = z.object({
  name: z.string().min(1).max(200),
  size: z.number().int().positive(),
  type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
});

const landOfferSchema = z.object({
  governorateId: z.number().int().positive(),
  delegationId: z.number().int().positive(),
  locationDescription: z.string().trim().max(1000),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  areaValue: z.number().positive().max(10_000_000),
  areaUnit: z.enum(["ha", "m2"]),
  propertyTypeOptionId: z.uuid(),
  oliveTreeCount: z.number().int().min(0).max(10_000_000).nullable(),
  treeAgeOptionId: z.uuid().nullable(),
  irrigation: z.enum(["rainfed", "irrigated"]),
  waterSource: z.string().trim().max(200),
  askingPriceDinars: z.number().min(0).max(10_000_000_000).nullable(),
  priceNegotiable: z.boolean(),
  documentOptionIds: z.array(z.uuid()).max(30),
  contactName: z.string().trim().min(3).max(120),
  contactPhone: z.string().trim().min(6).max(30),
  contactCapacity: z.enum(["owner", "agent", "broker"]),
  consent: z.literal(true),
  website: z.string().max(200),
  source: z.record(z.string(), z.string().max(300)),
  files: z.array(fileSchema).max(50),
});

export type LandOfferInput = z.input<typeof landOfferSchema>;

export type SubmitLandOfferResult =
  | { ok: true; offerId: string; referenceNo: string; uploads: { path: string; token: string; index: number }[] }
  | { ok: false; message: string };

export async function submitLandOffer(input: LandOfferInput): Promise<SubmitLandOfferResult> {
  const config = await getPublicConfig();
  const state = flagState(config, "land_offers");
  if (state === "disabled" || (state === "internal" && !(await getStaffSession()))) {
    return { ok: false, message: "إرسال العروض غير متاح حالياً. حاول لاحقاً." };
  }

  const parsed = landOfferSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: "بعض المعلومات ناقصة أو غير صحيحة. راجع الفورمولير وحاول مجدداً." };
  }
  const data = parsed.data;
  if (data.website) {
    return { ok: false, message: intakeErrorMessage(null) };
  }

  // LAND-03: file count and size limits come from the Back Office.
  const maxFiles = settingInt(config, "land_offer.max_files", 10);
  const maxBytes = Math.min(settingInt(config, "land_offer.max_file_size_mb", 10), 20) * 1024 * 1024;
  if (data.files.length > maxFiles) {
    return { ok: false, message: `يمكنك إرفاق ${maxFiles} ملفات كحد أقصى.` };
  }
  if (data.files.some((file) => file.size > maxBytes)) {
    return { ok: false, message: `حجم كل ملف يجب ألا يتجاوز ${maxBytes / (1024 * 1024)} ميغابايت.` };
  }

  const phone = normalizePhone(data.contactPhone, settingBool(config, "lead.allow_international_phone"));
  if (!phone.ok) {
    return { ok: false, message: intakeErrorMessage(phone.reason === "not_tunisian" ? "phone_not_tunisian" : "invalid_phone") };
  }

  const requestHeaders = await headers();
  const supabase = createAdminClient(auditHeaders(requestHeaders));

  const { data: result, error } = await supabase.rpc("submit_land_offer", {
    p: {
      governorate_id: data.governorateId,
      delegation_id: data.delegationId,
      location_description: data.locationDescription,
      latitude: data.latitude,
      longitude: data.longitude,
      area_value: data.areaValue,
      area_unit: data.areaUnit,
      property_type_option_id: data.propertyTypeOptionId,
      olive_tree_count: data.oliveTreeCount,
      tree_age_option_id: data.treeAgeOptionId,
      irrigation: data.irrigation,
      water_source: data.irrigation === "irrigated" ? data.waterSource : "",
      asking_price_millimes: data.askingPriceDinars === null ? null : Math.round(data.askingPriceDinars * 1000),
      price_negotiable: data.priceNegotiable,
      document_option_ids: data.documentOptionIds,
      contact_name: data.contactName,
      contact_phone_e164: phone.e164,
      contact_capacity: data.contactCapacity,
      consent_text: settingText(config, "legal.consent_text", "موافقة على التواصل ومعالجة المعطيات"),
      ip_hash: hashIp(clientIp(requestHeaders)),
      source: data.source,
    },
  });

  if (error) {
    if (!isKnownIntakeError(error.message)) {
      console.error("submit_land_offer failed", error);
    }
    return { ok: false, message: intakeErrorMessage(error.message) };
  }

  const offer = result as { id?: string; reference_no?: string } | null;
  if (!offer?.id || !offer.reference_no) {
    console.error("submit_land_offer returned an unexpected result", result);
    return { ok: false, message: intakeErrorMessage(null) };
  }

  // Files go straight from the browser to private storage with one-time upload tokens.
  const uploads: { path: string; token: string; index: number }[] = [];
  for (const [index, file] of data.files.entries()) {
    const path = `${offer.id}/${randomUUID()}.${FILE_EXTENSIONS[file.type]}`;
    const { data: signed, error: signError } = await supabase.storage.from(LAND_OFFER_BUCKET).createSignedUploadUrl(path);
    if (signError || !signed) {
      console.error("createSignedUploadUrl failed", signError);
      continue;
    }
    uploads.push({ path: signed.path, token: signed.token, index });
  }

  // The RPC queued the confirmation; send it once the visitor has their success screen.
  dispatchAfterResponse();
  return { ok: true, offerId: offer.id, referenceNo: offer.reference_no, uploads };
}

const finalizeSchema = z.object({
  offerId: z.uuid(),
  files: z.array(z.object({ path: z.string().max(300), name: z.string().min(1).max(200) })).max(50),
});

/** Registers the files that really reached storage for a freshly created offer. */
export async function finalizeLandOfferFiles(input: z.input<typeof finalizeSchema>): Promise<{ saved: number }> {
  const parsed = finalizeSchema.safeParse(input);
  if (!parsed.success) return { saved: 0 };
  const { offerId, files } = parsed.data;

  const supabase = createAdminClient();
  const { data: offer } = await supabase.from("land_offers").select("id, created_at").eq("id", offerId).maybeSingle();
  const twoHours = 2 * 60 * 60 * 1000;
  if (!offer || Date.now() - new Date(offer.created_at).getTime() > twoHours) {
    return { saved: 0 };
  }

  const { data: objects, error } = await supabase.storage.from(LAND_OFFER_BUCKET).list(offerId, { limit: 100 });
  if (error || !objects) {
    console.error("Listing uploaded land offer files failed", error);
    return { saved: 0 };
  }
  const stored = new Map(objects.map((object) => [`${offerId}/${object.name}`, object]));

  const rows = files
    .filter((file) => file.path.startsWith(`${offerId}/`) && stored.has(file.path))
    .map((file) => {
      const object = stored.get(file.path)!;
      const metadata = (object.metadata ?? {}) as { size?: number; mimetype?: string };
      return {
        land_offer_id: offerId,
        storage_path: file.path,
        file_name: file.name,
        mime_type: metadata.mimetype ?? "application/octet-stream",
        size_bytes: metadata.size && metadata.size > 0 ? metadata.size : 1,
      };
    });

  if (rows.length === 0) return { saved: 0 };
  const { error: insertError } = await supabase
    .from("land_offer_files")
    .upsert(rows, { onConflict: "storage_path", ignoreDuplicates: true });
  if (insertError) {
    console.error("Saving land offer files failed", insertError);
    return { saved: 0 };
  }
  return { saved: rows.length };
}
