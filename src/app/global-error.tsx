"use client";

import { useEffect } from "react";

/**
 * The last net: a crash in the root layout, or before any page boundary mounts, replaces the whole document, so
 * (public)/error.tsx never sees it and the visitor is left on a blank screen (owner, 2026-09-16: «still the white
 * screen»). This renders its own document with an Arabic message, a retry and the error code to report.
 *
 * THE ONE PAGE WHOSE WORDS ARE IN CODE (0109), and in more than one language. It is drawn when the app itself has
 * crashed — outside every layout and provider, possibly because the database could not be read — so it cannot
 * look up the owner's texts or even know which of the five languages the visitor was reading. It says each
 * sentence in Arabic and repeats it on a line of French and English under it.
 */

const SECOND_LINE = { margin: "0.25rem 0 0", fontSize: "0.85rem", lineHeight: 1.6, color: "#4b5a52" } as const;
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
          <p dir="ltr" style={SECOND_LINE}>
            <span lang="fr">Un problème est survenu sur le site</span> · <span lang="en">Something went wrong on the site</span>
          </p>
          <p style={{ marginTop: "0.75rem", lineHeight: 1.8, color: "#4b5a52" }}>
            الصفحة ما كمّلتش كيما لازم. جرّب مرّة أخرى، وكان عاودت ابعثلنا رمز المشكلة اللي تحت.
          </p>
          <p dir="ltr" style={SECOND_LINE}>
            <span lang="fr">
              La page ne s’est pas chargée correctement. Réessayez ; si cela se reproduit, envoyez-nous le code
              ci-dessous.
            </span>{" "}
            · <span lang="en">The page did not load properly. Try again; if it happens again, send us the code below.</span>
          </p>
          {error.digest ? (
            <>
              <p style={{ marginTop: "0.75rem", fontSize: "0.8rem", color: "#4b5a52" }}>
                رمز المشكلة: <span dir="ltr">{error.digest}</span>
              </p>
              <p dir="ltr" style={{ ...SECOND_LINE, fontSize: "0.75rem" }}>
                <span lang="fr">Code de l’erreur</span> · <span lang="en">Error code</span>
              </p>
            </>
          ) : null}
          <div style={{ marginTop: "2rem", display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                minHeight: "3rem",
                padding: "0.4rem 1.5rem",
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
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
              <span dir="ltr" style={{ fontSize: "0.75rem", fontWeight: 500, opacity: 0.85 }}>
                <span lang="fr">Réessayer</span> · <span lang="en">Try again</span>
              </span>
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the app shell has crashed here, so a full page load is the point */}
            <a
              href="/"
              style={{
                minHeight: "3rem",
                padding: "0.4rem 1.5rem",
                display: "inline-flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "0.75rem",
                border: "1px solid #c9d3cc",
                color: "#1f2d24",
                fontSize: "1rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              العودة للصفحة الرئيسية
              <span dir="ltr" style={{ fontSize: "0.75rem", fontWeight: 500, color: "#4b5a52" }}>
                <span lang="fr">Accueil</span> · <span lang="en">Home</span>
              </span>
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
