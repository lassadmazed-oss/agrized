"use server";

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/components/admin/action-form";
import { ADMIN_ROLES, requireStaff } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// «إشعارات الموقع» (0174). Administrators write, publish and archive; the database checks the role again
// (app.is_admin) and refuses a link that leaves the site.

const PAGE = "/admin/notices";

type Rpc = (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

const ERRORS: Record<string, string> = {
  not_admin: "الصلاحية هذي للإدارة وحدها.",
  invalid_title: "اكتب عنوان الإشعار (حرفين على الأقل).",
  notice_not_found: "الإشعار هذا ما عادش موجود. حدّث الصفحة.",
  invalid_status: "طلب موش مفهوم.",
};

function refuse(message: string): ActionResult {
  if (message.includes("site_notices_link_path_check")) {
    return { ok: false, message: "الرابط لازم يكون صفحة من الموقع ويبدا بـ«/»، مثلاً /start ولا /projects." };
  }
  if (message.includes("image_url")) return { ok: false, message: "رابط الصورة لازم يبدا بـhttps://" };
  return { ok: false, message: ERRORS[message] ?? "ما تسجّلش. ثبّت في الخانات وعاود." };
}

export async function saveNotice(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const field = (name: string) => String(formData.get(name) ?? "").trim();
  const supabase = await createClient();
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
  const { error } = await rpc("staff_save_site_notice", {
    p: {
      id: field("id") || null,
      kind: field("kind") || "custom",
      title: field("title"),
      body: field("body"),
      link: field("link"),
      cta: field("cta"),
      image: field("image"),
      audience: field("audience") || "everyone",
      after_days: field("after_days") || null,
      pop: formData.get("pop") === "on",
    },
  });
  if (error) return refuse(error.message);
  revalidatePath(PAGE);
  return { ok: true, message: field("id") ? "تسجّل التبديل." : "الإشعار تسجّل كمسودّة. انشرو كي يكون جاهز." };
}

export async function setNoticeStatus(id: string, status: "draft" | "published" | "archived"): Promise<ActionResult> {
  await requireStaff(ADMIN_ROLES);
  const supabase = await createClient();
  const rpc = (supabase as unknown as { rpc: Rpc }).rpc.bind(supabase);
  const { error } = await rpc("staff_site_notice_status", { p_id: id, p_status: status });
  if (error) return refuse(error.message);
  revalidatePath(PAGE);
  return {
    ok: true,
    message: status === "published" ? "تنشر: يبان للناس كي يحلّو الموقع." : status === "archived" ? "تأرشف." : "رجع مسودّة.",
  };
}
