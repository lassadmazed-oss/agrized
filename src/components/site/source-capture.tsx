"use client";

import { useEffect } from "react";

const STORAGE_KEY = "agrized:source";
const PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "ref"] as const;

export type VisitSource = Partial<Record<(typeof PARAMS)[number] | "referrer" | "landing_path", string>>;

/** Remembers where the visitor first came from (campaign, referrer) for this browser tab (HOME-04). */
export function SourceCapture() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(STORAGE_KEY)) return;
      const url = new URL(window.location.href);
      const source: VisitSource = { landing_path: url.pathname };
      for (const key of PARAMS) {
        const value = url.searchParams.get(key);
        if (value) source[key] = value.slice(0, 150);
      }
      if (document.referrer && !document.referrer.startsWith(window.location.origin)) {
        source.referrer = document.referrer.slice(0, 300);
      }
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(source));
    } catch {
      // Storage unavailable (private mode, blocked cookies): tracking is optional.
    }
  }, []);

  return null;
}

export function readVisitSource(): VisitSource {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as VisitSource) : {};
  } catch {
    return {};
  }
}
