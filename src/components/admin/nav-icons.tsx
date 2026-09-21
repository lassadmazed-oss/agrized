// The Back Office had no icons at all: eighteen rows of identical Arabic text, which is a large part of
// why the sidebar read as one undifferentiated block. These are inline SVG — no icon package, no network
// request, no font — drawn on one 24×24 grid with one stroke weight so the column reads as a set.
//
// Every icon is decorative: the label beside it carries the meaning, so each one is aria-hidden.

import type { ReactNode } from "react";

import type { AdminIconKey } from "./nav-model";

const SHAPES: Record<AdminIconKey, ReactNode> = {
  /* A gauge: what the dashboard is. */
  dashboard: (
    <>
      <path d="M3.5 17.5a8.5 8.5 0 1 1 17 0" />
      <path d="M12 17.5 16 12.8" />
      <circle cx="12" cy="17.5" r="1.1" />
    </>
  ),
  /* A clipboard of incoming requests. */
  requests: (
    <>
      <path d="M9.5 3.5h5v3h-5z" />
      <path d="M14.5 5.5h2.6A1.4 1.4 0 0 1 18.5 7v12.6a1.4 1.4 0 0 1-1.4 1.4H6.9a1.4 1.4 0 0 1-1.4-1.4V7a1.4 1.4 0 0 1 1.4-1.4h2.6" />
      <path d="M8.8 11.5h6.4M8.8 15.5h4" />
    </>
  ),
  analytics: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M7 20.5v-5.5M12 20.5v-11M17 20.5v-8" />
    </>
  ),
  /* A price tag: an offer. */
  offers: (
    <>
      <path d="M3.5 11.4V4.6a1.1 1.1 0 0 1 1.1-1.1h6.8c.3 0 .6.1.8.3l8 8a1.1 1.1 0 0 1 0 1.6l-6.7 6.7a1.1 1.1 0 0 1-1.6 0l-8-8a1.1 1.1 0 0 1-.4-.7Z" />
      <circle cx="7.9" cy="7.9" r="1.2" />
    </>
  ),
  /* A horizon with a hill: land offered to us. */
  land: (
    <>
      <path d="M3 19.5h18" />
      <path d="m3 19.5 5.6-7 3.4 4.2 3-3.6 6 6.4" />
      <circle cx="7.3" cy="6.6" r="2.2" />
    </>
  ),
  /* A calculator: the pricing parameters. */
  pricing: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <rect x="8" y="6.3" width="8" height="3.2" rx="0.8" />
      <path d="M8.6 13.2h.01M12 13.2h.01M15.4 13.2h.01M8.6 17h.01M12 17h.01M15.4 17h.01" />
    </>
  ),
  /* The plots-on-a-plan glyph for `parcels` stood here until 2026-09-19; the key left AdminIconKey with it. */
  reservations: <path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1Z" />,
  visits: (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  contracts: (
    <>
      <path d="M6.4 3.5h7.1L19 9v11.1a1.4 1.4 0 0 1-1.4 1.4H6.4A1.4 1.4 0 0 1 5 20.1V4.9a1.4 1.4 0 0 1 1.4-1.4Z" />
      <path d="M13.5 3.5V9H19" />
      <path d="M8.4 16.8c1.4-2.6 2.9-2.6 3.9 0s2.4 1 3.1-1" />
    </>
  ),
  payments: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.7" />
      <path d="M6 10.2v3.6M18 10.2v3.6" />
    </>
  ),
  /* A young olive tree: the agricultural follow-up. */
  services: (
    <>
      <path d="M12 21v-7.2" />
      <path d="M12 13.8c0-4 3-7 7-7 0 4-3 7-7 7Z" />
      <path d="M12 16c0-3-2.3-5.4-5.5-5.4 0 3 2.3 5.4 5.5 5.4Z" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
      <circle cx="9" cy="6.5" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="17.5" r="2" />
    </>
  ),
  modules: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.4" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.4" />
      <path d="M13.5 17h7M17 13.5v7" />
    </>
  ),
  lists: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
    </>
  ),
  media: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="8.6" cy="9.6" r="1.6" />
      <path d="m3.9 16.8 4.6-4.2 3.6 3.2 3.2-2.9 4.6 4.1" />
    </>
  ),
  users: (
    <>
      <circle cx="9.2" cy="8" r="3.2" />
      <path d="M2.8 20c0-3.6 2.8-5.6 6.4-5.6s6.4 2 6.4 5.6" />
      <path d="M16.4 5.3a3.2 3.2 0 0 1 0 5.9" />
      <path d="M17.6 14.8c2.3.6 3.6 2.2 3.6 5.2" />
    </>
  ),
  /* A clock turning back: the operations log. */
  audit: (
    <>
      <path d="M3.6 12a8.4 8.4 0 1 0 2.5-6" />
      <path d="M3.5 4.4V9H8" />
      <path d="M12 7.6V12l3 1.8" />
    </>
  ),
};

export function NavIcon({ name, className = "size-5" }: { name: AdminIconKey; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`flex-none ${className}`.trim()}
    >
      {SHAPES[name]}
    </svg>
  );
}

/** The three bars of the phone menu button. */
export function MenuIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      aria-hidden="true"
      className={`flex-none ${className}`.trim()}
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}
