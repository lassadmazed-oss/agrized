"use server";

import { revalidatePath, updateTag } from "next/cache";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { PUBLIC_CONFIG_TAG } from "@/lib/config";
import { messageArguments } from "@/lib/i18n/message";
import { isFlatStringMap, jsonLeaves, leafId, TARGET_LOCALES, withLeaf } from "@/lib/i18n/translatable";
import { PUBLIC_PROJECTS_TAG } from "@/lib/public-projects";
import { renderWorstCase, smsSegments } from "@/lib/sms-length";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { updateSetting } from "../actions";

/**
 * What one form in the translation room saves: one field of one thing, in the five languages.
 *
 *   kind     text — a sentence; json — a structured setting, taken apart into its strings; sms — a message
 *            that must fit ONE SMS at its worst case in every language (0079, 0109).
 *   arabic   where the Arabic is written when it is editable here: a setting, a message template, or
 *            nowhere (lists and offers keep their Arabic in their own editors, linked from the card).
 */
export type TranslationTarget = {
  entity: string;
  key: string;
  field: string;
  kind: "text" | "json" | "sms";
  arabic: "setting" | "template" | null;
};

/** A variable the translation names that its Arabic never fills — printed to the visitor in braces. */
function unknownPlaceholder(translation: string, source: string): string | null {
  const allowed = messageArguments(source);
  for (const name of messageArguments(translation, { printedOnly: true })) if (!allowed.has(name)) return name;
  return null;
}

const LANGUAGE_AR: Record<string, string> = { fr: "الفرنسية", de: "الألمانية", it: "الإيطالية", en: "الإنجليزية", ar: "العربية" };

/**
 * Saves the field in every language at once. A blank language DELETES its translation (the site then shows
 * the fallback — 0109 rule 2); a filled one is written and, because a person just saved it, is no longer a
 * draft. The Arabic, when it is editable here, goes through the same checks as on its own page.
 */
export async function saveTranslation(target: TranslationTarget, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  // ---- the source, as it stands (and as it will stand if its Arabic is changed in this same save) ----
  let source: Json | null = null;
  if (target.entity === "setting") {
    const { data } = await supabase.from("settings").select("value").eq("key", target.key).maybeSingle();
    source = data?.value ?? null;
  } else if (target.entity === "message_template") {
    const { data } = await supabase.from("message_templates").select("body_ar").eq("key", target.key).maybeSingle();
    source = data?.body_ar ?? null;
  } else {
    source = String(formData.get("source") ?? "");
  }
  if (source === null) return { ok: false, message: "هذا النص ما عادش موجود. حدّث الصفحة." };

  const newArabic = target.arabic ? String(formData.get("ar") ?? "").trim() : null;
  if (target.arabic && newArabic !== null && target.kind !== "json") {
    if (!newArabic) return { ok: false, message: "النص العربي هو الأصل وما يتخلاش فارغ." };
    if (newArabic.length > 2000) return { ok: false, message: "النص العربي طويل برشا (2000 حرف كأقصى حد)." };
    if (target.kind === "sms" && smsSegments(renderWorstCase(newArabic, true)) > 1) {
      return { ok: false, message: "النص العربي يتبعث في أكثر من SMS وحدة في أسوأ حالة (70 حرف). قصّرو." };
    }
  }
  const sourceText = typeof source === "string" ? (newArabic ?? source) : "";

  // ---- the four translations, checked before anything is written ----
  type Write = { locale: string; value: Json | null };
  const writes: Write[] = [];
  for (const locale of TARGET_LOCALES) {
    if (target.kind === "json") {
      const leaves = jsonLeaves(source);
      let value: unknown = isFlatStringMap(source) ? {} : source;
      let filled = 0;
      for (const leaf of leaves) {
        const text = String(formData.get(`${locale}::${leafId(leaf.path)}`) ?? "").trim();
        if (!text) continue;
        filled += 1;
        value = isFlatStringMap(source) ? { ...(value as Record<string, string>), [leaf.path[0]]: text } : withLeaf(value, leaf.path, text);
      }
      if (filled === 0) {
        writes.push({ locale, value: null });
        continue;
      }
      if (!isFlatStringMap(source) && filled < leaves.length) {
        return {
          ok: false,
          message: `ترجمة ${LANGUAGE_AR[locale]} ناقصة: هذا النص يتبدّل كامل، يا تكمّل كل الخانات يا تخليهم الكل فارغين.`,
        };
      }
      writes.push({ locale, value: value as Json });
      continue;
    }

    const text = String(formData.get(locale) ?? "").trim();
    if (!text) {
      writes.push({ locale, value: null });
      continue;
    }
    if (text.length > 2000) return { ok: false, message: `ترجمة ${LANGUAGE_AR[locale]} طويلة برشا (2000 حرف كأقصى حد).` };
    const stray = sourceText ? unknownPlaceholder(text, sourceText) : null;
    if (stray) {
      return {
        ok: false,
        message: `ترجمة ${LANGUAGE_AR[locale]} فيها الخانة {${stray}} اللي موش موجودة في النص العربي. استعمل نفس الخانات بالضبط.`,
      };
    }
    if (target.kind === "sms") {
      const segments = smsSegments(renderWorstCase(text));
      if (segments > 1) {
        return {
          ok: false,
          message: `ترجمة ${LANGUAGE_AR[locale]} تتبعث في ${segments} رسائل في أسوأ حالة. الحد: 160 حرف بالحروف اللاتينية العادية، و70 كان فيها حرف كيما ê ç « أو اسم عربي. قصّرها.`,
        };
      }
    }
    writes.push({ locale, value: text });
  }

  // ---- the Arabic ----
  if (target.arabic && newArabic !== null && target.kind !== "json" && newArabic !== source) {
    if (target.arabic === "setting") {
      const form = new FormData();
      form.set("value", newArabic);
      const result = await updateSetting(target.key, null, form);
      if (!result?.ok) return result;
    } else {
      const { data, error } = await supabase
        .from("message_templates")
        .update({ body_ar: newArabic })
        .eq("key", target.key)
        .select("key");
      if (error || !data?.length) return { ok: false, message: "تعذّر حفظ النص العربي. تحقق من صلاحياتك." };
    }
  }

  // ---- the translations ----
  const remove = writes.filter((write) => write.value === null).map((write) => write.locale);
  const upsert = writes
    .filter((write) => write.value !== null)
    .map((write) => ({
      entity: target.entity,
      entity_key: target.key,
      field: target.field,
      locale: write.locale,
      value: write.value as Json,
      is_draft: false,
    }));

  if (remove.length > 0) {
    const { error } = await supabase
      .from("translations")
      .delete()
      .eq("entity", target.entity)
      .eq("entity_key", target.key)
      .eq("field", target.field)
      .in("locale", remove);
    if (error) return { ok: false, message: "تعذّر حذف الترجمات الفارغة. تحقق من صلاحياتك وحاول مرة أخرى." };
  }
  if (upsert.length > 0) {
    const { error } = await supabase.from("translations").upsert(upsert, { onConflict: "entity,entity_key,field,locale" });
    if (error) {
      if (error.message.includes("translation_shape")) return { ok: false, message: "شكل الترجمة موش نفس شكل النص العربي." };
      return { ok: false, message: "تعذّر الحفظ. تحقق من صلاحياتك وحاول مرة أخرى." };
    }
  }

  updateTag(PUBLIC_CONFIG_TAG);
  if (target.entity === "project" || target.entity === "project_media") updateTag(PUBLIC_PROJECTS_TAG);
  revalidatePath("/admin/settings/translations");
  return { ok: true, message: "تم الحفظ. الترجمات المحفوظة ما عادش مسودات." };
}
