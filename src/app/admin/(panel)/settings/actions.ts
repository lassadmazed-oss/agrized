"use server";

import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { PUBLIC_CONFIG_TAG } from "@/lib/config";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

// PRN-01: legal texts can be edited but never emptied (they cannot be hidden from the site).
const REQUIRED_TEXT = new Set([
  "site.home_headline",
  "site.free_interest_notice",
  "legal.no_guarantee_notice",
  "legal.consent_text",
  "legal.land_offer_notice",
  "legal.parcel_card_note",
  "legal.plan_notice",
  "request_no.prefix",
  "land_offer_no.prefix",
]);

const INTEGER_RANGES: Record<string, [number, number]> = {
  "projects.installment_examples": [1, 5],
  "projects.listing_limit": [20, 1000],
  "antispam.max_requests_per_ip_per_hour": [1, 1000],
  "antispam.max_requests_per_phone_per_day": [1, 100],
  "antispam.max_land_offers_per_ip_per_day": [1, 100],
  "land_offer.max_file_size_mb": [1, 20],
  "land_offer.max_files": [0, 50],
};

const JSON_SCHEMAS: Record<string, { schema: z.ZodType; message: string }> = {
  "site.how_it_works": {
    schema: z
      .array(z.object({ title: z.string().trim().min(1).max(80), text: z.string().trim().min(1).max(300) }))
      .max(10),
    message: "كل خطوة تحتاج عنواناً (80 حرفاً كحد أقصى) ونصاً (300 حرف). 10 خطوات كحد أقصى.",
  },
  "site.faq": {
    schema: z.array(z.object({ q: z.string().trim().min(1).max(200), a: z.string().trim().min(1).max(2000) })).max(30),
    message: "كل سؤال يحتاج نص السؤال والجواب. 30 سؤالاً كحد أقصى.",
  },
};

type Parsed = { ok: true; value: Json } | { ok: false; message: string };

function parseText(key: string, raw: string): Parsed {
  const text = raw.trim();
  if (REQUIRED_TEXT.has(key) && !text) return { ok: false, message: "هذا النص إلزامي ولا يمكن تركه فارغاً." };
  if (text.length > 2000) return { ok: false, message: "النص طويل جداً (2000 حرف كحد أقصى)." };
  if ((key === "request_no.prefix" || key === "land_offer_no.prefix") && !/^[A-Z0-9-]{2,12}$/.test(text)) {
    return { ok: false, message: "البادئة من 2 إلى 12 حرفاً: أحرف لاتينية كبيرة وأرقام و«-» فقط." };
  }
  if (key === "crm.auto_assign_mode" && !["manual", "round_robin"].includes(text)) {
    return { ok: false, message: "اختر طريقة الإسناد من القائمة." };
  }
  if ((key === "site.contact_phone" || key === "site.contact_whatsapp") && text && !/^\+[1-9]\d{6,14}$/.test(text)) {
    return { ok: false, message: "اكتب الرقم بصيغة دولية، مثال: +21671000000، أو اتركه فارغاً." };
  }
  if (key === "site.contact_email" && text && !z.email().safeParse(text).success) {
    return { ok: false, message: "البريد الإلكتروني غير صحيح." };
  }
  return { ok: true, value: text };
}

function parseValue(key: string, type: string, formData: FormData): Parsed {
  const raw = formData.get("value");
  switch (type) {
    case "boolean":
      return { ok: true, value: raw === "on" };
    case "integer": {
      const number = Number(raw);
      const [min, max] = INTEGER_RANGES[key] ?? [0, 1_000_000];
      if (!Number.isInteger(number) || number < min || number > max) {
        return { ok: false, message: `اكتب عدداً صحيحاً بين ${min} و${max}.` };
      }
      return { ok: true, value: number };
    }
    case "text":
    case "money":
      return parseText(key, String(raw ?? ""));
    case "json": {
      if (key === "simulator.durations_months") {
        const months = String(raw ?? "")
          .split(/[,،\s]+/)
          .filter(Boolean)
          .map(Number);
        if (months.length === 0 || months.length > 8 || months.some((m) => !Number.isInteger(m) || m < 1 || m > 600)) {
          return { ok: false, message: "اكتب من 1 إلى 8 مدد بالأشهر، مفصولة بفواصل. مثال: 36، 48، 60" };
        }
        return { ok: true, value: [...new Set(months)].sort((a, b) => a - b) };
      }
      const rule = JSON_SCHEMAS[key];
      if (!rule) return { ok: false, message: "هذا الإعداد لا يُعدَّل من هذه الصفحة." };
      try {
        const result = rule.schema.safeParse(JSON.parse(String(raw ?? "")));
        return result.success ? { ok: true, value: result.data as Json } : { ok: false, message: rule.message };
      } catch {
        return { ok: false, message: rule.message };
      }
    }
    default:
      return { ok: false, message: "نوع إعداد غير معروف." };
  }
}

export async function updateSetting(key: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const { data: setting } = await supabase.from("settings").select("key, value_type").eq("key", key).maybeSingle();
  if (!setting) return { ok: false, message: "هذا الإعداد غير موجود." };

  const parsed = parseValue(key, setting.value_type, formData);
  if (!parsed.ok) return parsed;

  const { data, error } = await supabase.from("settings").update({ value: parsed.value }).eq("key", key).select("key");
  if (error || !data?.length) {
    return { ok: false, message: "تعذّر الحفظ. تحقق من صلاحياتك وحاول مرة أخرى." };
  }

  updateTag(PUBLIC_CONFIG_TAG);
  revalidatePath("/admin/settings");
  return { ok: true, message: "تم الحفظ." };
}
