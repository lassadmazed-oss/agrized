"use client";

// The French Back Office (owner, 2026-11-20: «حتى الادمين خليه عربي وفرنسي»).
//
// HOW. The Back Office is written in Arabic across ~200 files. Threading a t() through every one would have
// frozen every other piece of work for weeks, so the French screen is a READING of the Arabic one: once React
// has hydrated the page, every Arabic text and every placeholder/title/aria-label on it is looked up in one
// dictionary, src/app/admin/i18n/fr.json, and replaced; a MutationObserver does the same for whatever React
// draws afterwards (a navigation, a form's answer, a dialog). Nothing is machine-translated: a sentence the
// dictionary does not hold stays Arabic, and `node scripts/admin-i18n-extract.mjs --missing` lists them.
//
// The dictionary has three ways to match, tried in order:
//   1. the sentence itself (JSX text and string literals, as React renders them);
//   2. a pattern from a template literal: `${n} زيتونة` is «{0} زيتونة», and what fills {0} is looked up too;
//   3. a sentence built by joining others («أ · ب», «أ، ب», «أ:») is translated piece by piece.
// What is left — the units and month names the formatters print — goes through WORDS.
//
// A word the dictionary cannot settle alone («الموقع» is a place on a land offer and the public site in the
// rail) carries its French on its element: <span data-fr="Site">الموقع</span>.
//
// SAFETY. It only ever writes French over text React itself wrote, after hydration, so the server and the
// client never disagree about the first render. Data people typed (names, notes, inputs, textareas) is not a
// sentence of the dictionary and stays as it was; a region marked data-no-translate is never touched.

import { useEffect } from "react";

type Dictionary = { exact: Record<string, string>; patterns: [string, string][] };
type Pattern = { re: RegExp; fr: string; order: number[]; anchor: string; weight: number };

const ARABIC = /[؀-ۿ]/;
const ATTRIBUTES = ["placeholder", "title", "aria-label", "alt"] as const;
const SKIP = "script,style,noscript,textarea,[data-no-translate],[contenteditable='true']";

/** What the formatters and the lists print around the sentences: units, months, punctuation. */
const WORDS: [RegExp, string][] = [
  [/د\.ت/g, "DT"],
  [/م²/g, "m²"],
  [/(\d)\s?م(?=\s|$|[.,)])/g, "$1 m"],
  [/جانفي|يناير/g, "janvier"],
  [/فيفري|فبراير/g, "février"],
  [/مارس/g, "mars"],
  [/أفريل|أبريل|إبريل/g, "avril"],
  [/ماي(?![؀-ۿ])|مايو/g, "mai"],
  [/جوان|يونيو/g, "juin"],
  [/جويلية|يوليو/g, "juillet"],
  [/أوت|أغسطس/g, "août"],
  [/سبتمبر/g, "septembre"],
  [/أكتوبر/g, "octobre"],
  [/نوفمبر/g, "novembre"],
  [/ديسمبر/g, "décembre"],
  [/،\s?/g, ", "],
  [/؟/g, " ?"],
  [/؛/g, " ;"],
];

/** The joints of a sentence made of sentences, with what each becomes in French. */
const JOINTS = /(\s+·\s+|\s+—\s+|\s+\|\s+|،\s*|\s+←\s+|\s+→\s+)/;
const JOINT_FR: Record<string, string> = { "،": ", ", "←": " → ", "→": " ← " };

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const tidy = (text: string) => text.replace(/\s+/g, " ").trim();

function compile(dictionary: Dictionary) {
  const exact = new Map(Object.entries(dictionary.exact));
  const patterns: Pattern[] = dictionary.patterns
    .map(([ar, fr]) => {
      const parts = ar.split(/\{(\d+)\}/);
      const order: number[] = [];
      let source = "^";
      parts.forEach((part, index) => {
        if (index % 2 === 0) source += escapeRegExp(part);
        else {
          source += "(.+?)";
          order.push(Number(part));
        }
      });
      const literals = parts.filter((_, index) => index % 2 === 0);
      const anchor = literals.map((part) => part.trim()).reduce((a, b) => (b.length > a.length ? b : a), "");
      return { re: new RegExp(`${source}$`, "s"), fr, order, anchor, weight: literals.join("").length };
    })
    // A pattern with no Arabic of its own would match anything; the longest, most specific ones go first.
    .filter((pattern) => ARABIC.test(pattern.anchor))
    .sort((a, b) => b.weight - a.weight);

  const cache = new Map<string, string | null>();

  function words(text: string): string {
    return WORDS.reduce((out, [re, fr]) => out.replace(re, fr), text);
  }

  function lookup(core: string, depth = 0): string | null {
    if (!ARABIC.test(core)) return core;
    const cached = cache.get(core);
    if (cached !== undefined) return cached;

    let out: string | null = exact.get(core) ?? null;

    if (out === null) {
      for (const pattern of patterns) {
        if (!core.includes(pattern.anchor)) continue;
        const match = pattern.re.exec(core);
        if (!match) continue;
        out = pattern.fr.replace(/\{(\d+)\}/g, (whole, index: string) => {
          const at = pattern.order.indexOf(Number(index));
          if (at < 0) return whole;
          const value = match[at + 1] ?? "";
          return depth < 3 ? (lookup(tidy(value), depth + 1) ?? words(value)) : value;
        });
        break;
      }
    }

    if (out === null && depth < 3) {
      // «سجّل:» · «"…"» — the same sentence with its punctuation or its quotes around it.
      const quoted = /^«\s*(.+?)\s*»$/.exec(core);
      const punctuated = /^(.+?)\s*([.:!؟?…]+)$/.exec(core);
      if (quoted) {
        const inner = lookup(quoted[1], depth + 1);
        if (inner !== null) out = `« ${inner} »`;
      } else if (punctuated) {
        const inner = lookup(punctuated[1], depth + 1);
        if (inner !== null) out = inner + words(punctuated[2]);
      }
    }

    if (out === null && depth < 3) {
      const pieces = core.split(JOINTS);
      if (pieces.length > 1) {
        let changed = false;
        const joined = pieces
          .map((piece, index) => {
            if (index % 2 === 1) return JOINT_FR[piece.trim()] ?? piece;
            const part = tidy(piece);
            if (!ARABIC.test(part)) return piece;
            const fr = lookup(part, depth + 1);
            if (fr === null) return piece;
            changed = true;
            return fr;
          })
          .join("");
        if (changed) out = words(joined);
      }
    }

    if (out === null) {
      const fallback = words(core);
      if (fallback !== core) out = fallback;
    }

    cache.set(core, out);
    return out;
  }

  /** A text as the page holds it, its surrounding spaces kept. Null when there is nothing to change. */
  return function translate(raw: string): string | null {
    if (!ARABIC.test(raw)) return null;
    const lead = /^\s*/.exec(raw)?.[0] ?? "";
    const trail = /\s*$/.exec(raw)?.[0] ?? "";
    const fr = lookup(tidy(raw));
    return fr === null ? null : lead + fr + trail;
  };
}

export function AdminTranslator() {
  useEffect(() => {
    let cancelled = false;
    let observer: MutationObserver | null = null;
    const original = { alert: window.alert, confirm: window.confirm, prompt: window.prompt };
    const reveal = () => document.documentElement.removeAttribute("data-translating");

    import("@/app/admin/i18n/fr.json")
      .then((module) => {
        if (cancelled) return;
        const translate = compile((module.default ?? module) as unknown as Dictionary);
        /** What this reader last wrote into a text node, so its own writes are not read again. */
        const written = new WeakMap<Node, string>();

        const skipped = (element: Element | null) => !element || element.closest(SKIP) !== null;

        const text = (node: Text) => {
          const value = node.data;
          if (written.get(node) === value || !ARABIC.test(value) || skipped(node.parentElement)) return;
          const own = node.parentElement?.getAttribute("data-fr");
          const fr = own ? value.replace(value.trim(), own) : translate(value);
          written.set(node, fr ?? value);
          if (fr !== null && fr !== value) node.data = fr;
        };

        const element = (node: Element) => {
          if (skipped(node)) return;
          for (const name of ATTRIBUTES) {
            const value = node.getAttribute(name);
            if (!value || !ARABIC.test(value)) continue;
            const fr = translate(value);
            if (fr !== null && fr !== value) node.setAttribute(name, fr);
          }
          if (node instanceof HTMLInputElement && (node.type === "submit" || node.type === "button") && ARABIC.test(node.value)) {
            const fr = translate(node.value);
            if (fr !== null && fr !== node.value) node.value = fr;
          }
        };

        const walk = (root: Node) => {
          if (root.nodeType === Node.TEXT_NODE) return text(root as Text);
          if (root.nodeType !== Node.ELEMENT_NODE) return;
          element(root as Element);
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (node.nodeType === Node.TEXT_NODE) text(node as Text);
            else element(node as Element);
          }
        };

        walk(document.documentElement);
        reveal();

        observer = new MutationObserver((records) => {
          for (const record of records) {
            if (record.type === "childList") record.addedNodes.forEach(walk);
            else if (record.type === "characterData") text(record.target as Text);
            else if (record.type === "attributes") element(record.target as Element);
          }
        });
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          characterData: true,
          attributes: true,
          attributeFilter: [...ATTRIBUTES],
        });

        const say = (message: unknown) => (typeof message === "string" ? (translate(message) ?? message) : message);
        window.alert = (message?: unknown) => original.alert.call(window, say(message));
        window.confirm = (message?: string) => original.confirm.call(window, say(message) as string | undefined);
        window.prompt = (message?: string, value?: string) => original.prompt.call(window, say(message) as string | undefined, value);
      })
      .catch(reveal);

    return () => {
      cancelled = true;
      observer?.disconnect();
      Object.assign(window, original);
    };
  }, []);

  return null;
}
