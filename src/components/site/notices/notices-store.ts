"use client";

import { useSyncExternalStore } from "react";

import type { NoticesAnswer, SiteNotice } from "@/lib/site-notices";

/**
 * One list of notices per page, shared by the header's bell (from md), the phone's floating bell and the arrival
 * card — fetched once, read once. A known person's reads go to the database (/api/notices); anyone else's stay in
 * this browser's localStorage, wrapped because private windows throw.
 */

const READ_KEY = "agz:notices:read";
const HIDDEN_KEY = "agz:notices:hidden";
const POPPED_KEY = "agz:notices:popped";

type State = { loaded: boolean; personal: boolean; notices: SiteNotice[]; read: ReadonlySet<string>; card: SiteNotice | null };

let state: State = { loaded: false, personal: false, notices: [], read: new Set(), card: null };
const listeners = new Set<() => void>();
let started: string | null = null;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function readSet(storage: "local" | "session", key: string): Set<string> {
  try {
    const raw = (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(list) ? list.filter((item): item is string => typeof item === "string") : []);
  } catch {
    return new Set();
  }
}

function writeSet(storage: "local" | "session", key: string, values: ReadonlySet<string>) {
  try {
    (storage === "local" ? window.localStorage : window.sessionStorage).setItem(key, JSON.stringify([...values].slice(-200)));
  } catch {
    // A browser that refuses storage shows the notice again next time; nothing breaks.
  }
}

export function isRead(notice: SiteNotice): boolean {
  return state.personal ? notice.read : state.read.has(notice.id);
}

/** Fetch once per page language. The arrival card is chosen here, once a visit. */
export function loadNotices(locale: string) {
  if (started === locale) return;
  started = locale;
  fetch(`/api/notices?locale=${locale}`, { cache: "no-store" })
    .then((response) => (response.ok ? (response.json() as Promise<NoticesAnswer>) : null))
    .then((data) => {
      if (!data) return;
      const hidden = readSet("local", HIDDEN_KEY);
      const read = readSet("local", READ_KEY);
      const notices = data.notices.filter((notice) => !hidden.has(notice.id));
      set({ loaded: true, personal: data.personal, notices, read });
      const popped = readSet("session", POPPED_KEY);
      const first = notices.find((notice) => notice.pop && !isRead(notice) && !popped.has(notice.id));
      if (first) {
        popped.add(first.id);
        writeSet("session", POPPED_KEY, popped);
        window.setTimeout(() => set({ card: first }), 2500);
      }
    })
    .catch(() => undefined);
}

export function markNotices(ids: readonly string[], action: "read" | "dismiss") {
  if (ids.length === 0) return;
  if (state.personal) {
    for (const id of ids) {
      void fetch("/api/notices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      }).catch(() => undefined);
    }
  }
  const read = new Set(state.read);
  for (const id of ids) read.add(id);
  writeSet("local", READ_KEY, read);
  if (action === "dismiss") {
    const hidden = readSet("local", HIDDEN_KEY);
    for (const id of ids) hidden.add(id);
    writeSet("local", HIDDEN_KEY, hidden);
  }
  set({
    read,
    notices:
      action === "dismiss"
        ? state.notices.filter((notice) => !ids.includes(notice.id))
        : state.notices.map((notice) => (ids.includes(notice.id) ? { ...notice, read: true } : notice)),
    card: state.card && ids.includes(state.card.id) ? null : state.card,
  });
}

export function closeCard() {
  set({ card: null });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const SERVER_STATE: State = { loaded: false, personal: false, notices: [], read: new Set(), card: null };

export function useNotices(): State {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}
