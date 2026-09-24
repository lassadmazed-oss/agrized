import Link from "next/link";

/**
 * Renders the assistant's answer.
 *
 * THE MODEL'S OUTPUT IS DATA, NOT MARKUP. It is never put in the page as HTML. This walks the text, turns
 * `[نص](/مسار)` into a real link, and prints everything else as plain text — so a model that emits a script
 * tag, an `onclick`, or a `javascript:` url produces those characters on screen and nothing more.
 *
 * A LINK IS ONLY DRAWN WHEN IT EXISTS. `allowed` is the list of paths the server built the answer from: the
 * offers that were open at that moment plus the handful of fixed routes. A path outside that list is
 * printed as its own label with no link, because an invented `/projects/DEMO-99` sends a visitor to a 404
 * and reads, to them, as the site being broken.
 */

// `[label](/path)`: internal paths only — a leading slash is required, so no scheme can ever appear here.
const LINK = /\[([^\]\n]{1,120})\]\((\/[^)\s]{0,160})\)/g;

/** Models reach for ** for emphasis; the answer is one short paragraph and does not need it. */
function clean(text: string): string {
  return text.replace(/\*\*/g, "").replace(/\r/g, "");
}

/**
 * Plain text between the links.
 *
 * Square brackets are dropped. A model that half-remembers the link format writes «[start]» with no target,
 * and the visitor is shown a stray «[start]» — brackets and all — at the end of an otherwise good answer.
 * The word alone reads correctly; the punctuation is the model's scaffolding, not its message.
 */
function plain(text: string): string {
  return text.replace(/[[\]]/g, "");
}

export function AnswerText({
  text,
  allowed,
  plain: carded,
}: {
  text: string;
  allowed: string[];
  /**
   * Paths that already have a card under this answer.
   *
   * Their label is printed as emphasis rather than as a link: the card below carries the same offer with its
   * place, its price and a button, and one offer offered twice in four lines reads as a page repeating
   * itself. The words stay exactly where the sentence put them — only the underline goes.
   */
  plain?: ReadonlySet<string>;
}) {
  const source = clean(text);
  const permitted = new Set(allowed);
  const nodes: React.ReactNode[] = [];

  let cursor = 0;
  let key = 0;

  for (const match of source.matchAll(LINK)) {
    const at = match.index ?? 0;
    if (at > cursor) nodes.push(plain(source.slice(cursor, at)));

    const [whole, label, href] = match;
    if (carded?.has(href)) {
      nodes.push(
        <b key={`c${key++}`} className="font-semibold text-ink">
          {label}
        </b>,
      );
    } else if (permitted.has(href)) {
      nodes.push(
        <Link
          key={`l${key++}`}
          href={href}
          className="font-semibold text-forest underline decoration-leaf decoration-2 underline-offset-2"
        >
          {label}
        </Link>,
      );
    } else {
      // Not a route the server vouched for: keep the words, drop the link.
      nodes.push(label);
    }
    cursor = at + whole.length;
  }

  if (cursor < source.length) nodes.push(plain(source.slice(cursor)));

  return (
    <p className="whitespace-pre-wrap text-body leading-relaxed">
      {nodes.map((node, index) =>
        typeof node === "string" ? <span key={`t${index}`}>{node}</span> : node,
      )}
    </p>
  );
}
