"use client";

import { useEffect } from "react";

/**
 * The last net: a crash in the root layout, or before any page boundary mounts, replaces the whole document, so
 * (public)/error.tsx never sees it and the visitor is left on a blank screen (owner, 2026-09-16: «still the white
 * screen»). This renders its own document with an Arabic message, a retry and the error code to report.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("global error", error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#f7f5ee",
          color: "#1f2d24",
          fontFamily: "system-ui, 'Segoe UI', Tahoma, sans-serif",
          padding: "2rem 1rem",
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: "32rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0 }}>صارت مشكلة في الموقع</h1>
          <p style={{ marginTop: "0.75rem", lineHeight: 1.8, color: "#4b5a52" }}>
            الصفحة ما كمّلتش كيما لازم. جرّب مرّة أخرى، وكان عاودت ابعثلنا رمز المشكلة اللي تحت.
          </p>
          {error.digest ? (
            <p style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "#4b5a52" }}>
              رمز المشكلة: <span dir="ltr">{error.digest}</span>
            </p>
          ) : null}
          <div style={{ marginTop: "2rem", display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: "3rem",
                padding: "0 1.5rem",
                borderRadius: "0.75rem",
                border: "none",
                background: "#1f6b44",
                color: "#fff",
                fontSize: "1rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              جرّب مرّة أخرى
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the app shell has crashed here, so a full page load is the point */}
            <a
              href="/"
              style={{
                minHeight: "3rem",
                padding: "0 1.5rem",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "0.75rem",
                border: "1px solid #c9d3cc",
                color: "#1f2d24",
                fontSize: "1rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              العودة للصفحة الرئيسية
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
