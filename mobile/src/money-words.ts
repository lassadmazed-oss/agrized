/*
 * الثمن بالحروف — an amount written out, the way it is written on a cheque.
 *
 * This file is the mirror of src/lib/money-words.ts, and for the same reason format.ts mirrors the site's
 * formatters: a price that reads one way in the browser and another on the phone is two prices. It imports
 * nothing, so it can be read and tested without a database.
 *
 * WHY THIS EXISTS (the owner, 2026-10-22). «فما فيرجول… تقولش عليها المليون، يولي تقولش عليها الألف دينار،
 * يولي تقولش عليها ألف فرنك.» A Tunisian reading «4,450,000» has three honest readings of it: four and a
 * half million (of something), four thousand four hundred and fifty dinars, or — since «مليون» in daily
 * speech is a thousand dinars and «فرنك» is a millime — four hundred and forty-five «مليون». The separator
 * and the unit are both ambiguous, and no amount of punctuation fixes a word that means two things.
 *
 * Written out, it cannot be misread: «أربعة آلاف وأربعمائة وخمسون ديناراً» is one number in one unit.
 *
 * ARABIC ONLY, AND THAT IS THE POINT. The ambiguity is Tunisian Arabic's. A reader of «4 450 DT» in French,
 * German, Italian or English has no such question to ask, so there is nothing for words to answer there and
 * `formatMillimesInWords` returns an empty string outside Arabic; the screens draw nothing.
 *
 * THE GRAMMAR IS THE CLASSICAL ONE (تمييز العدد), decided by the LAST TWO DIGITS of the counted amount:
 *
 *     1          دينار واحد
 *     2          ديناران
 *     3 – 10     ثلاثة دنانير        (plural)
 *     11 – 99    أحد عشر ديناراً     (singular, accusative)
 *     100, 1000… مائة دينار          (singular, genitive)
 *
 * so 4450 ends in 50 and takes «ديناراً», while 4400 ends in 00 and takes «دينار». Getting this wrong is
 * what makes written-out money read as machine output, which is the opposite of the reassurance it is for.
 */

const ONES = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة"];
const TEENS = [
  "عشرة",
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];

const AND = " و";

/** 1 – 999. Units come before tens, as Arabic says them: «ثلاثة وأربعون». */
function under1000(n: number): string {
  const parts: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest) {
    if (rest < 10) parts.push(ONES[rest]);
    else if (rest < 20) parts.push(TEENS[rest - 10]);
    else {
      const ones = rest % 10;
      const tens = Math.floor(rest / 10);
      parts.push(ones ? ONES[ones] + AND + TENS[tens] : TENS[tens]);
    }
  }
  return parts.join(AND);
}

/** The five forms a counted noun takes, chosen by the last two digits. See the header. */
type Forms = { one: string; two: string; few: string; many: string; plain: string };

function counted(n: number, f: Forms): string {
  const last2 = n % 100;
  if (last2 === 1) return f.one;
  if (last2 === 2) return f.two;
  if (last2 >= 3 && last2 <= 10) return f.few;
  if (last2 >= 11 && last2 <= 99) return f.many;
  return f.plain;
}

/**
 * A dual loses its final nūn when the thing it counts follows it directly (إضافة): «مائتان» standing in a
 * list stays whole — «مائتان وثلاثة وأربعون» — but «مائتان دينار» is «مائتا دينار», and «ألفان دينار» is
 * «ألفا دينار». Applied only at the junction where a noun follows, never where «و» does.
 */
const DUAL_CONSTRUCT: ReadonlyArray<readonly [string, string]> = [
  ["مائتان", "مائتا"],
  ["ألفان", "ألفا"],
  ["مليونان", "مليونا"],
  ["ملياران", "مليارا"],
];

function construct(words: string): string {
  for (const [full, short] of DUAL_CONSTRUCT) {
    if (words.endsWith(full)) return words.slice(0, words.length - full.length) + short;
  }
  return words;
}

const THOUSAND: Forms = { one: "ألف", two: "ألفان", few: "آلاف", many: "ألفاً", plain: "ألف" };
const MILLION: Forms = { one: "مليون", two: "مليونان", few: "ملايين", many: "مليوناً", plain: "مليون" };
const BILLION: Forms = { one: "مليار", two: "ملياران", few: "مليارات", many: "ملياراً", plain: "مليار" };

/**
 * A scale group in words: «ألف» and «ألفان» stand alone (nobody says «واحد ألف»), the rest carry their count.
 */
function scaled(n: number, f: Forms): string {
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  return construct(under1000(n)) + " " + counted(n, f);
}

/** 0 – 999,999,999,999 in words. Zero is the caller's problem; it never reaches here with one. */
function wholeInWords(n: number): string {
  const parts: string[] = [];
  const billions = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const rest = n % 1000;
  if (billions) parts.push(scaled(billions, BILLION));
  if (millions) parts.push(scaled(millions, MILLION));
  if (thousands) parts.push(scaled(thousands, THOUSAND));
  if (rest) parts.push(under1000(rest));
  return parts.join(AND);
}

// «دينار واحد» and not «ديناراً واحداً»: a price label is a statement, not a counted phrase inside a
// sentence, and the accusative reads like a grammar exercise where a figure should be.
const DINAR: Forms = { one: "دينار واحد", two: "ديناران", few: "دنانير", many: "ديناراً", plain: "دينار" };
const MILLIME: Forms = { one: "مليم واحد", two: "مليمان", few: "مليمات", many: "مليماً", plain: "مليم" };

/** A counted amount and its unit: «أربعة آلاف وأربعمائة وخمسون ديناراً», and «دينار واحد» on its own. */
function amountInWords(n: number, f: Forms): string {
  if (n === 1) return f.one;
  if (n === 2) return f.two;
  return construct(wholeInWords(n)) + " " + counted(n, f);
}

/**
 * Millimes written out in Arabic: «أربعة آلاف وأربعمائة وخمسون ديناراً».
 *
 * The millimes fraction is said only when there is one — a round payment that reads «… ديناراً وصفر مليم»
 * is noise on every line it appears. Zero is «صفر دينار», which is a real thing to print beside a free
 * option. A negative amount keeps its sign in words, because «ناقص» before a figure is how a refund reads.
 */
export function moneyWordsAr(millimes: number): string {
  if (!Number.isFinite(millimes)) return "";
  const negative = millimes < 0;
  const total = Math.round(Math.abs(millimes));
  const dinars = Math.floor(total / 1000);
  const rest = total % 1000;

  let words: string;
  if (dinars === 0 && rest === 0) words = "صفر دينار";
  else if (dinars === 0) words = amountInWords(rest, MILLIME);
  else words = amountInWords(dinars, DINAR) + (rest ? AND + amountInWords(rest, MILLIME) : "");

  return negative ? "ناقص " + words : words;
}
