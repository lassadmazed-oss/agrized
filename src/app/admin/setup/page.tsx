import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/admin/action-form";
import { Wordmark } from "@/components/brand/wordmark";

import { listSuperAdminEmails, setSuperAdminPassword, setupAllowed } from "./actions";

export const metadata: Metadata = {
  title: "ضبط كلمة السر",
  robots: { index: false, follow: false },
};

// Reads the request host and the setup token, so it can never be prerendered.
export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: PageProps<"/admin/setup">) {
  const { token } = await searchParams;
  const tokenValue = typeof token === "string" ? token : undefined;
  if (!(await setupAllowed(tokenValue))) {
    notFound();
  }

  const emails = await listSuperAdminEmails();

  return (
    <div className="grid min-h-dvh place-items-center bg-paper px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center">
          <Wordmark className="text-4xl" />
          <h1 className="mt-4 text-lg font-semibold text-ink">ضبط كلمة السر لأول مرة</h1>
          <p className="mt-1 text-sm text-muted">
            صفحة محلية مؤقتة، تخدم على هذا الجهاز فقط وبالرابط السرّي. اكتب كلمة السر اللي تحبها لحساب Super Admin.
          </p>
        </div>

        <div className="card mt-8 p-6">
          {emails.length === 0 ? (
            <p className="text-sm text-danger">
              ما فماش حساب Super Admin. أنشئ واحداً أولاً بالأمر:{" "}
              <span dir="ltr" className="font-mono text-xs">
                npm run admin:create -- --email you@example.com --name &quot;Your Name&quot;
              </span>
            </p>
          ) : (
            <ActionForm action={setSuperAdminPassword} submitLabel="ضبط كلمة السر" className="space-y-5">
              <input type="hidden" name="token" value={tokenValue} />

              <div>
                <label htmlFor="email" className="label">
                  الحساب
                </label>
                <select id="email" name="email" required defaultValue={emails[0]} dir="ltr" className="field text-left">
                  {emails.map((email) => (
                    <option key={email} value={email}>
                      {email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="password" className="label">
                  كلمة السر الجديدة
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  dir="ltr"
                  className="field text-left"
                />
                <p className="hint mt-1.5">8 أحرف على الأقل. هذا الحساب يرى معطيات الحرفاء كلها، فاختر كلمة قوية.</p>
              </div>

              <div>
                <label htmlFor="confirm" className="label">
                  تأكيد كلمة السر
                </label>
                <input
                  id="confirm"
                  name="confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  dir="ltr"
                  className="field text-left"
                />
              </div>
            </ActionForm>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          بعد النجاح:{" "}
          <Link href="/admin/login" className="font-semibold text-forest underline-offset-4 hover:underline">
            دخول الفريق
          </Link>
        </p>
      </div>
    </div>
  );
}
