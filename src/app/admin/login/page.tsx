import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Wordmark } from "@/components/brand/wordmark";
import { getStaffSession } from "@/lib/auth";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "دخول الفريق",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage({ searchParams }: PageProps<"/admin/login">) {
  if (await getStaffSession()) {
    redirect("/admin");
  }

  const { next } = await searchParams;

  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <Wordmark className="text-4xl" />
          <h1 className="mt-4 text-lg font-semibold text-ink">دخول فريق AgriZed</h1>
          <p className="mt-1 text-sm text-muted">الـBack Office مخصص لموظفي AgriZed فقط.</p>
        </div>
        <div className="mt-8 rounded-2xl border border-line bg-surface p-6">
          <LoginForm next={typeof next === "string" ? next : "/admin"} />
        </div>
      </div>
    </div>
  );
}
