/**
 * «الزيتونات» as a human types them: «5-11» · «5، 10، 15» · «5-11, 20, 25».
 *
 * WHY A PARSER AND NOT THREE FIELDS. The owner describes the sale as «the trees are numbered — from 5 to 11
 * are his, or 5, 10, 15 are his» (2026-09-23). Those are the same sentence with different punctuation, and a
 * form that made you choose «range mode» or «list mode» first would be asking about our data model instead of
 * about the sale. One box takes both, and anything in between.
 *
 * IT IS USED ON BOTH SIDES OF THE WIRE. The browser parses to show the count and the numbers before the press;
 * the Server Action parses the same text again, because what the browser computed is a convenience and what
 * the server sends to Postgres is the sale. Same function, so they cannot disagree.
 *
 * WHAT IT REFUSES, IT REFUSES IN WORDS. «5-» is not a range, «0» is not a tree, «11-5» is backwards, and a
 * thousand-tree typo is likelier than a thousand-tree sale. Every refusal names the piece that is wrong, so a
 * seller fixes the token rather than retyping the line.
 */

/** A sale of more trees than this is a typo, not a sale. The cap only protects the form; SQL has its own. */
const MAX_TREES = 2000;

export type ParsedTrees =
  | { ok: true; seqs: number[] }
  | { ok: false; message: string };

/** Arabic-Indic digits, so «٥-١١» works for anyone typing on an Arabic keyboard. */
function westernDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (digit) =>
    String(digit.charCodeAt(0) & 0x0f),
  );
}

export function parseTreeNumbers(input: string): ParsedTrees {
  const text = westernDigits(input ?? "")
    // every separator a person might reach for: Arabic comma, Latin comma, semicolon, newline, «و»
    .replace(/[،;\n\r]+/g, ",")
    .replace(/\s+و\s+/g, ",")
    .trim();

  if (text === "") return { ok: false, message: "اكتب أرقام الزيتونات. مثال: 5-11 ولا 5، 10، 15." };

  const seqs = new Set<number>();

  for (const rawToken of text.split(",")) {
    const token = rawToken.trim();
    if (token === "") continue;

    // A range: 5-11, 5–11, 5 — 11, and «5 إلى 11».
    const range = token.match(/^(\d+)\s*(?:-|–|—|إلى|to)\s*(\d+)$/);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from < 1 || to < 1) return { ok: false, message: `«${token}»: أرقام الزيتونات تبدا من 1.` };
      if (to < from) return { ok: false, message: `«${token}»: الرقم الأوّل لازم يكون أصغر من الثاني.` };
      if (to - from + 1 > MAX_TREES) {
        return { ok: false, message: `«${token}»: مقطع كبير برشة (أكثر من ${MAX_TREES} زيتونة).` };
      }
      for (let seq = from; seq <= to; seq += 1) seqs.add(seq);
      continue;
    }

    // A single tree.
    if (/^\d+$/.test(token)) {
      const seq = Number(token);
      if (seq < 1) return { ok: false, message: "أرقام الزيتونات تبدا من 1." };
      seqs.add(seq);
      continue;
    }

    return { ok: false, message: `«${token}» موش رقم زيتونة. اكتب 5 ولا 5-11.` };
  }

  if (seqs.size === 0) return { ok: false, message: "اكتب أرقام الزيتونات. مثال: 5-11 ولا 5، 10، 15." };
  if (seqs.size > MAX_TREES) {
    return { ok: false, message: `${seqs.size} زيتونة برشة على بيعة وحدة. تثبّت من الأرقام.` };
  }

  return { ok: true, seqs: [...seqs].sort((a, b) => a - b) };
}

/**
 * The numbers written back the short way: [5,6,7,20] → «5-7، 20».
 *
 * A seller who typed «5-40» must see «5-40» confirmed back, not thirty-six numbers — the echo is there to be
 * checked against what they meant, and a wall of digits cannot be checked.
 */
export function formatTreeNumbers(seqs: readonly number[]): string {
  if (seqs.length === 0) return "";
  const sorted = [...seqs].sort((a, b) => a - b);
  const parts: string[] = [];

  let start = sorted[0];
  let previous = sorted[0];

  for (const seq of sorted.slice(1)) {
    if (seq === previous + 1) {
      previous = seq;
      continue;
    }
    parts.push(start === previous ? String(start) : `${start}-${previous}`);
    start = seq;
    previous = seq;
  }
  parts.push(start === previous ? String(start) : `${start}-${previous}`);

  return parts.join("، ");
}
