"use server";

import { revalidatePath, updateTag } from "next/cache";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { PUBLIC_CONFIG_TAG } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

const SITE_MEDIA_BUCKET = "site-media";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

function done(message: string): ActionResult {
  updateTag(PUBLIC_CONFIG_TAG);
  revalidatePath("/admin/settings/media");
  revalidatePath("/");
  return { ok: true, message };
}

/**
 * Puts one picture in a slot of the public site (MED-01).
 * The file goes to the public `site-media` bucket; only the address is stored on the row.
 */
export async function saveSlotImage(slot: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const file = formData.get("file");
  const alt = String(formData.get("alt") ?? "").trim();
  const hasNewFile = file instanceof File && file.size > 0;

  const { data: current, error: readError } = await supabase
    .from("site_media")
    .select("url, alt_ar")
    .eq("slot", slot)
    .maybeSingle();
  if (readError) return { ok: false, message: `تعذّرت القراءة: ${readError.message}` };
  if (!current) return { ok: false, message: "هذا الموضع غير موجود." };

  // A picture without alternative text is unusable for a screen reader, and the database refuses it.
  if ((hasNewFile || current.url) && !alt) {
    return { ok: false, message: "اكتب وصفاً مختصراً للصورة (نص بديل). إلزامي حتى تبقى الصفحة مقروءة للجميع." };
  }

  let url = current.url;

  if (hasNewFile) {
    const extension = TYPES[file.type];
    if (!extension) return { ok: false, message: "الصيغ المقبولة: JPG، PNG، WEBP أو AVIF." };
    if (file.size > MAX_BYTES) return { ok: false, message: "حجم الصورة يتجاوز 5 ميغا. اضغطها ثم أعد المحاولة." };

    // A fresh name on every upload, so a replaced picture is never served from a cache.
    const path = `${slot.replace(/[^a-z0-9._-]/gi, "-")}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from(SITE_MEDIA_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) return { ok: false, message: `تعذّر رفع الصورة: ${uploadError.message}` };

    url = supabase.storage.from(SITE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("site_media").update({ url, alt_ar: alt }).eq("slot", slot);
  if (error) return { ok: false, message: `تعذّر الحفظ: ${error.message}` };

  return done(hasNewFile ? "تم رفع الصورة ونشرها في الموقع." : "تم تحديث النص البديل.");
}

/** Empties a slot. The site falls back to the branded drawing, never to a broken frame. */
export async function clearSlotImage(slot: string): Promise<void> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  await supabase.from("site_media").update({ url: null, alt_ar: null }).eq("slot", slot);
  updateTag(PUBLIC_CONFIG_TAG);
  revalidatePath("/admin/settings/media");
  revalidatePath("/");
}

/**
 * Puts a picture into the home page's sliding cover, or takes it out (owner, 2026-10-03: «in the cover giv
 * me in the admin some acsess to manige the imges of the cover thing that is auto sliding»).
 *
 * Which pictures slide was an array in src/components/site/landing/hero.tsx until today, so changing the
 * front page of the business needed a developer and a deploy. It is a checkbox now.
 *
 * The decision is made in SQL (staff_set_media_cover, 0123) rather than with an update from here, because
 * two of the three rules it enforces cannot be seen from one row: a slot with no picture may not be in the
 * slider, and the slider may not be emptied — the home page would open on a blank frame either way, and the
 * second one is only knowable by counting every other row. A disabled checkbox is not a rule.
 */
export async function setSlotInCover(slot: string, inCover: boolean): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const { error } = await supabase.rpc("staff_set_media_cover", { p_slot: slot, p_in_cover: inCover });
  if (error) return { ok: false, message: coverMessage(error.message) };

  return done(inCover ? "تزادت الصورة في شريط الغلاف." : "تنحّات الصورة من شريط الغلاف.");
}

/** Every refusal says what happened AND what to do about it. */
function coverMessage(code: string): string {
  if (code.includes("media_slot_empty")) {
    return "ما تنجّمش تحطّ في شريط الغلاف موضع فارغ: الشريط بش يوري رسم العلامة في وسط الدوران وكأنّ الصورة تكسّرت. إرفع الصورة الأول، ومن بعد علّمها.";
  }
  if (code.includes("media_cover_empty")) {
    return "لازم تبقى صورة وحدة على الأقل في شريط الغلاف: كان نحّيناهم الكل، الصفحة الرئيسية تفتح على إطار فارغ. علّم صورة أخرى الأول، ومن بعد نحّي هذي.";
  }
  if (code.includes("media_slot_not_found")) {
    return "هذا الموضع ما عادش موجود. حدّث الصفحة وأعد المحاولة.";
  }
  if (code.includes("forbidden") || code.includes("42501")) {
    return "ما عندكش الصلاحية باش تبدّل صور الموقع. هذي شاشة إدارة.";
  }
  if (code.includes("PGRST202") || code.includes("42883")) {
    return "ميزة شريط الغلاف مازالت ما تركّبتش في قاعدة البيانات (supabase/migrations/0123_cover_slots.sql). كلّم المسؤول باش يركّبها.";
  }
  return "تعذّر الحفظ. حدّث الصفحة وأعد المحاولة.";
}

/**
 * ADDING A PICTURE TO THE HOME PAGE'S SLIDING COVER, IN ONE STEP.
 *
 * The first version of this made the owner do it in three: name a slot, then find it in the list, then upload
 * a file into it, then tick it into the cover. He said so plainly — «i can just show the img here … i don't
 * like the user experience you made, bad … and auto add to the cover» — and he was right: what he wants is to
 * add a PICTURE, and a «slot» is this code's word, not his.
 *
 * So the form asks for the file and one line describing it, and this does the four steps:
 *   1 · the row (staff_create_media_slot, 0128) — the key is generated there, never typed;
 *   2 · the file into the public bucket;
 *   3 · the row learns its address and its alternative text;
 *   4 · straight into the cover (staff_set_media_cover, 0123).
 *
 * THE ONE LINE IS BOTH THE NAME AND THE ALTERNATIVE TEXT, which is why it is still required when the
 * description field is gone. A picture with no alt text is unusable to a screen reader and the database
 * refuses it outright (site_media_alt_needed); asking for the same sentence twice, once to label a row the
 * owner never thinks about and once for accessibility, was the form being written from the table's point of
 * view instead of his.
 *
 * The aspect field is gone too. coverSlots() reads `in_cover` and `url` and nothing else — a slot's aspect
 * only ever shaped the thumbnail on this screen, so asking him to choose one was asking him to decide
 * something that does not leave this page.
 *
 * ROLLBACK IS BY HAND because these are four calls and not one transaction: if the upload or the save fails,
 * the row that was just created is deleted again rather than left as an empty slot he did not ask for. A
 * failure at step 4 is different — the picture is good and uploaded, only the tick failed — so that one keeps
 * everything and says what is left to do.
 */
export async function addCoverPicture(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const file = formData.get("file");
  const alt = String(formData.get("alt") ?? "").trim();

  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "اختار صورة من تلفونك ولا من الحاسوب." };
  const extension = TYPES[file.type];
  if (!extension) return { ok: false, message: "الصيغ المقبولة: JPG، PNG، WEBP أو AVIF." };
  if (file.size > MAX_BYTES) return { ok: false, message: "حجم الصورة يتجاوز 5 ميغا. اضغطها ثم أعد المحاولة." };
  if (!alt) {
    return { ok: false, message: "اكتب سطر يوصف الصورة. يخدم كاسمها هنا، ويقراه قارئ الشاشة للي ما ينجّمش يشوفها." };
  }

  // 1 · the row. The label is the same sentence, cut to what the column takes.
  const { data: created, error: createError } = await supabase.rpc("staff_create_media_slot", {
    p_label: alt.slice(0, 80),
  });
  if (createError) return { ok: false, message: slotMessage(createError.message) };
  // No cast: staff_create_media_slot returns the row itself, and the generated types carry its shape.
  const slot = created?.slot;
  if (!slot) return { ok: false, message: "تعذّر إنشاء الموضع. حدّث الصفحة وأعد المحاولة." };

  const undo = async () => {
    const { error } = await supabase.rpc("staff_delete_media_slot", { p_slot: slot });
    if (error) console.error("could not roll back the empty slot", slot, error.message);
  };

  // 2 · the file. A fresh name every time, so a replaced picture is never served from a cache.
  const path = `${slot}/${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(SITE_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) {
    await undo();
    return { ok: false, message: `تعذّر رفع الصورة: ${uploadError.message}` };
  }
  const url = supabase.storage.from(SITE_MEDIA_BUCKET).getPublicUrl(path).data.publicUrl;

  // 3 · the row learns where its picture is.
  const { error: saveError } = await supabase.from("site_media").update({ url, alt_ar: alt }).eq("slot", slot);
  if (saveError) {
    await undo();
    return { ok: false, message: `تعذّر الحفظ: ${saveError.message}` };
  }

  // 4 · into the cover. It has a picture now, which is the rule staff_set_media_cover enforces.
  const { error: coverError } = await supabase.rpc("staff_set_media_cover", { p_slot: slot, p_in_cover: true });
  if (coverError) {
    return done("تزادت الصورة، أمّا ما دخلتش لشريط الغلاف. علّمها من القائمة تحت.");
  }

  return done("تزادت الصورة ودخلت لشريط الغلاف. تدور توّا في الصفحة الرئيسية.");
}

/**
 * Removes a slot the owner added, and the picture file with it.
 *
 * Only his own: the seeded slots are rendered by name on the site (SitePhoto slot="home.hero"…) and deleting
 * one would quietly empty a section. The database refuses those; this only has to say so in his words.
 */
export async function deleteSlot(slot: string): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("staff_delete_media_slot", { p_slot: slot });
  if (error) return { ok: false, message: slotMessage(error.message) };

  // The row is gone; the file is only storage. A file that will not delete is never worth failing a delete
  // the database has already committed — it costs bytes, not a page.
  const url = (data as { url?: string | null } | null)?.url ?? null;
  if (url) {
    const marker = `/${SITE_MEDIA_BUCKET}/`;
    const at = url.indexOf(marker);
    if (at >= 0) {
      const path = decodeURIComponent(url.slice(at + marker.length));
      const { error: removeError } = await supabase.storage.from(SITE_MEDIA_BUCKET).remove([path]);
      if (removeError) console.error("site-media file not removed", path, removeError.message);
    }
  }

  return done("تفسخ الموضع.");
}

/** Every refusal says what happened AND what to do about it. */
function slotMessage(code: string): string {
  if (code.includes("label_required")) {
    return "اكتب سطر يوصف الصورة.";
  }
  if (code.includes("slot_is_builtin")) {
    return "هذا الموضع يستعملو الموقع باسمو، فما يتفسخش — كان تحبّ تنحّي صورتو، استعمل «إزالة الصورة».";
  }
  if (code.includes("cover_would_be_empty")) {
    return "هذي آخر صورة في شريط الغلاف: كان فسختها، الصفحة الرئيسية تفتح على إطار فارغ. علّم صورة أخرى الأول.";
  }
  if (code.includes("not_found")) {
    return "هذا الموضع ما عادش موجود. حدّث الصفحة.";
  }
  if (code.includes("forbidden") || code.includes("42501")) {
    return "ما عندكش الصلاحية باش تزيد ولا تفسخ مواضع. هذي شاشة إدارة.";
  }
  if (code.includes("PGRST202") || code.includes("42883")) {
    return "ميزة زيادة المواضع مازالت ما تركّبتش في قاعدة البيانات (supabase/migrations/0128_media_slots.sql).";
  }
  return "تعذّرت العملية. حدّث الصفحة وأعد المحاولة.";
}
