"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { logAuthEvent } from "@/lib/auth-events";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null; email: string };

const credentialsSchema = z.object({
  email: z.email().max(200),
  password: z.string().min(1).max(200),
});

/** Only same-site Back Office paths are allowed after sign-in (no open redirects). */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/admin") && !next.startsWith("//") && !next.startsWith("/admin/login") ? next : "/admin";
}

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const parsed = credentialsSchema.safeParse({ email, password: formData.get("password") });
  if (!parsed.success) {
    return { error: "اكتب البريد الإلكتروني وكلمة السر.", email };
  }

  const requestHeaders = await headers();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error || !data.user) {
    await logAuthEvent("auth.login_failed", requestHeaders, { email });
    return { error: "البريد الإلكتروني أو كلمة السر غير صحيحة.", email };
  }

  const [{ data: profile }, { data: roles }] = await Promise.all([
    supabase.from("profiles").select("is_active").eq("id", data.user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", data.user.id),
  ]);
  const isStaff = Boolean(profile?.is_active) && (roles ?? []).some((row) => row.role !== "client");

  if (!isStaff) {
    await supabase.auth.signOut();
    await logAuthEvent("auth.login_denied", requestHeaders, { userId: data.user.id, email });
    return { error: "هذا الحساب لا يملك صلاحية الدخول إلى الـBack Office، أو تم إيقافه.", email };
  }

  await logAuthEvent("auth.login", requestHeaders, { userId: data.user.id, email });
  redirect(safeNext(formData.get("next")));
}

export async function signOut() {
  const requestHeaders = await headers();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  await supabase.auth.signOut();
  if (data?.claims?.sub) {
    await logAuthEvent("auth.logout", requestHeaders, { userId: data.claims.sub });
  }
  redirect("/admin/login");
}
