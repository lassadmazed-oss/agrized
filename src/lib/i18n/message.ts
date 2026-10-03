import { INTL_NUMBER, type Locale } from "./locales";

/**
 * The owner's texts with their blanks filled in — a small, dependency-free subset of ICU MessageFormat, enough
 * for what this site says and no more:
 *
 *   {name}                                   the value, as is (a number is formatted for the language)
 *   {count, plural, one {…} two {…} other {…}} the language's own plural rules (Intl.PluralRules): Arabic has
 *                                            zero/one/two/few/many/other, French one/many/other, German and
 *                                            English one/other. `=0`, `=1`… match an exact number first. `#`
 *                                            inside a branch is the number.
 *   {kind, select, a {…} b {…} other {…}}    a choice on a word
 *
 * It replaces countAr / minutesAr / lettersAr, which knew Arabic grammar in code: «دقيقة» for one, «دقيقتين»
 * for two, «دقايق» from three to ten. That knowledge now lives in the owner's text, per language, as
 * `{minutes, plural, one {دقيقة} two {دقيقتين} few {# دقايق} other {# دقيقة}}`, and German needs only two
 * branches.
 *
 * A text the formatter cannot parse is returned as written rather than thrown: a typo in the Back Office must
 * show on the page as a typo, not take the page down.
 */

export type MessageVars = Record<string, string | number | null | undefined>;

const pluralCache = new Map<Locale, Intl.PluralRules>();
const numberCache = new Map<Locale, Intl.NumberFormat>();

function pluralRules(locale: Locale): Intl.PluralRules {
  let rules = pluralCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale);
    pluralCache.set(locale, rules);
  }
  return rules;
}

function numberFormat(locale: Locale): Intl.NumberFormat {
  let format = numberCache.get(locale);
  if (!format) {
    format = new Intl.NumberFormat(INTL_NUMBER[locale], { maximumFractionDigits: 2 });
    numberCache.set(locale, format);
  }
  return format;
}

function show(locale: Locale, value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  return typeof value === "number" ? numberFormat(locale).format(value) : value;
}

/** Index of the brace closing the one opened at `open`, or -1. */
function closing(text: string, open: number): number {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** «one {a} other {b}» → { one: "a", other: "b" }. */
function branches(body: string): Record<string, string> | null {
  const result: Record<string, string> = {};
  let i = 0;
  while (i < body.length) {
    while (i < body.length && /\s/.test(body[i])) i += 1;
    if (i >= body.length) break;
    const keyStart = i;
    while (i < body.length && !/[\s{]/.test(body[i])) i += 1;
    const key = body.slice(keyStart, i);
    while (i < body.length && /\s/.test(body[i])) i += 1;
    if (body[i] !== "{" || !key) return null;
    const end = closing(body, i);
    if (end < 0) return null;
    result[key] = body.slice(i + 1, end);
    i = end + 1;
  }
  return result;
}

function render(locale: Locale, text: string, vars: MessageVars, hash: string | null): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === "#" && hash !== null) {
      out += hash;
      i += 1;
      continue;
    }
    if (char !== "{") {
      out += char;
      i += 1;
      continue;
    }
    const end = closing(text, i);
    if (end < 0) return out + text.slice(i);
    const inner = text.slice(i + 1, end);
    const comma = inner.indexOf(",");
    if (comma < 0) {
      const name = inner.trim();
      out += name in vars ? show(locale, vars[name]) : `{${inner}}`;
    } else {
      const name = inner.slice(0, comma).trim();
      const rest = inner.slice(comma + 1);
      const second = rest.indexOf(",");
      const kind = (second < 0 ? rest : rest.slice(0, second)).trim();
      const options = second < 0 ? null : branches(rest.slice(second + 1));
      const value = vars[name];
      if (!options || (kind !== "plural" && kind !== "select")) {
        out += text.slice(i, end + 1);
      } else if (kind === "plural") {
        const n = typeof value === "number" ? value : Number(value);
        const exact = options[`=${n}`];
        const branch = exact ?? options[Number.isFinite(n) ? pluralRules(locale).select(n) : "other"] ?? options.other ?? "";
        out += render(locale, branch, vars, Number.isFinite(n) ? show(locale, n) : "");
      } else {
        const branch = options[String(value ?? "")] ?? options.other ?? "";
        out += render(locale, branch, vars, hash);
      }
    }
    i = end + 1;
  }
  return out;
}

/**
 * The variable names a text uses — `{name}`, and the `count` of `{count, plural, …}` — walking the same grammar
 * as the formatter, so the words inside a branch (`one {olivier}`) are never mistaken for a variable. The Back
 * Office uses it (with `printedOnly`) to refuse a translation that would print a `{name}` its Arabic does not
 * fill; a translation may still choose a plural on a number the Arabic simply does not need to inflect.
 */
export function messageArguments(text: string, { printedOnly = false }: { printedOnly?: boolean } = {}): Set<string> {
  const names = new Set<string>();
  const walk = (part: string) => {
    let i = 0;
    while (i < part.length) {
      if (part[i] !== "{") {
        i += 1;
        continue;
      }
      const end = closing(part, i);
      if (end < 0) return;
      const inner = part.slice(i + 1, end);
      const comma = inner.indexOf(",");
      if (comma < 0) {
        if (/^\s*[A-Za-z_][\w]*\s*$/.test(inner)) names.add(inner.trim());
      } else {
        // A plural or a select never prints its variable in braces — with the variable missing it falls to its
        // `other` branch — so `printedOnly` leaves it out and keeps only the `{name}`s that would show as typed.
        if (!printedOnly) names.add(inner.slice(0, comma).trim());
        const rest = inner.slice(comma + 1);
        const second = rest.indexOf(",");
        const options = second < 0 ? null : branches(rest.slice(second + 1));
        if (options) for (const branch of Object.values(options)) walk(branch);
      }
      i = end + 1;
    }
  };
  walk(text);
  return names;
}

export function formatMessage(locale: Locale, text: string, vars?: MessageVars): string {
  if (!vars || !text.includes("{")) return text;
  return render(locale, text, vars, null);
}
