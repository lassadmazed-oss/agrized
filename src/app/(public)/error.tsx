"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Whatever a public page throws in the browser lands here instead of the blank screen the App Router shows without
 * a boundary (owner, 2026-09-16: «i get white screen»). The visitor reads an Arabic message and retries the same
 * page without losing the address, and the error reaches the console so the next report carries a name.
 */
export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("public page error", error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg px-4 py-16 text-center sm:px-6">
      <h1 className="font-display text-3xl font-bold text-forest">صارت مشكلة في هذه الصفحة</h1>
      <p className="mt-3 leading-7 text-muted">
        ما كمّلتش كيما لازم. جرّب مرّة أخرى، واختياراتك تقعد كيما هي. كان عاودت، اتصل بينا ونحلّوها.
      </p>
      {error.digest ? (
        <p className="mt-3 text-xs text-muted">
          رمز المشكلة: <span dir="ltr">{error.digest}</span>
        </p>
      ) : null}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="btn btn-primary">
          جرّب مرّة أخرى
        </button>
        <Link href="/" className="btn btn-secondary">
          العودة للصفحة الرئيسية
        </Link>
      </div>
    </div>
  );
}
