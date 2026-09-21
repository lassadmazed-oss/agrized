import Link from "next/link";

import { StatusPill } from "@/components/ui";
import { formatCount, formatMillimes, formatMonthYear } from "@/lib/format";

/**
 * The client's own screen on a phone (owner, 2026-09-21, from the AgriZed app mock-up «حسابي / متابعتي»):
 * who you are, what you hold, and the short list of everything the space keeps for you.
 *
 * WHY THIS ONE DRAWS A SIGNED-IN SCREEN WHEN THE OTHER TWO REFUSED TO. The home screen dropped the mock-up's
 * greeting and avatar because they were furniture on a page that works perfectly without them: a visitor has
 * never told us their name. Here the account IS the page — refusing to draw it would leave an empty screen, not
 * an honest one. So the screen is built, and the one thing that is missing is named on it rather than faked:
 * there is no door. No buyer can sign in (no client role, persons.profile_id written nowhere, /admin/login the
 * only sign-in route), and how a buyer signs in is the owner's decision, not a decision to be taken inside a
 * design pass. Until it is taken, `holdings` arrives null and the card says so in the owner's own words.
 *
 * NOTHING HERE READS A DATABASE OR COMPUTES A PRICE. It renders the figures it is handed — the same figures
 * public.staff_zitounti_file() already answers for a person (trees, the offer they stand in, what was paid) —
 * so the day a client door exists this screen is pointed at that payload and not one line of it changes.
 *
 * It is a full screen, not a phone-only band: it is centred in a narrow column and reads the same on a desktop,
 * because a client opening their file on a laptop is not a different client.
 */

/** The drawings the rows use. One per §39 section, plus the two the summary card needs. */
export type AccountIcon =
  | "trees"
  | "requests"
  | "reservations"
  | "visits"
  | "payments"
  | "operations"
  | "subscription"
  | "harvest"
  | "contracts"
  | "documents";

const ICONS: Record<AccountIcon, React.ReactNode> = {
  trees: (
    <path d="M12 3c-2.2 0-4 1.8-4 4 0 .3 0 .6.1.8A3.5 3.5 0 0 0 6 11c0 1.9 1.6 3.5 3.5 3.5H11V21h2v-6.5h1.5C16.4 14.5 18 12.9 18 11a3.5 3.5 0 0 0-2.1-3.2c.1-.2.1-.5.1-.8 0-2.2-1.8-4-4-4Z" />
  ),
  requests: (
    <path d="M6 2h8l4 4v16H6V2Zm7.5 1.5V7H17l-3.5-3.5ZM8.5 11h7v1.5h-7V11Zm0 4h7v1.5h-7V15Z" />
  ),
  reservations: <path d="M7 2h10a1 1 0 0 1 1 1v19l-6-4-6 4V3a1 1 0 0 1 1-1Z" />,
  visits: (
    <path d="M7 2v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2V2h-2v2H9V2H7ZM5 10h14v10H5V10Zm2.5 2v2h2v-2h-2Z" />
  ),
  /* A banknote, drawn as a frame so it does not read as a solid block at 20px: the outer and inner rectangles
     punch each other out under evenodd, and the third subpath comes back as the filled centre. */
  payments: <path fillRule="evenodd" d="M2 5h20v14H2V5Zm2 2v10h16V7H4Zm8 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z" />,
  operations: (
    <path d="M12 2s6 6.5 6 10.5a6 6 0 0 1-12 0C6 8.5 12 2 12 2Zm0 16a5.5 5.5 0 0 0 4-1.8 4 4 0 0 1-8 0A5.5 5.5 0 0 0 12 18Z" />
  ),
  subscription: (
    <path d="M12 4a8 8 0 0 1 7 4.1l-1.7 1A6 6 0 0 0 6.6 11H9l-3.5 4L2 11h2.6A8 8 0 0 1 12 4Zm7.4 5L23 13h-2.6A8 8 0 0 1 5 15.9l1.7-1A6 6 0 0 0 17.4 13H15l4.4-4Z" />
  ),
  harvest: (
    <path d="M4 10h16l-1.3 10.2a2 2 0 0 1-2 1.8H7.3a2 2 0 0 1-2-1.8L4 10Zm8-8c2.8 0 5 2 5 4.5 0 .5-.1 1-.3 1.5H7.3A4.2 4.2 0 0 1 7 6.5C7 4 9.2 2 12 2Z" />
  ),
  /* A signed paper: the same sheet as a request, with the seal that makes it a contract. The seal is what
     tells the two rows apart at this size, so it is a solid disc and not a second outline. */
  contracts: (
    <path d="M6 2h8l4 4v8.3A4.5 4.5 0 0 0 11.3 22H6V2Zm7.5 1.5V7H17l-3.5-3.5ZM16.5 15.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" />
  ),
  documents: (
    <path d="M3 5a2 2 0 0 1 2-2h4.6l2 2H19a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5Zm2 4v10h14V9H5Z" />
  ),
};

function Icon({ name, className }: { name: AccountIcon; className: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      {ICONS[name]}
    </svg>
  );
}

/** Whoever the file belongs to. Null while nobody can sign in, which is every visitor today. */
export type AccountHolder = {
  name: string;
  /** When they joined, for «مستثمر منذ …». Null when the date is not worth showing. */
  since: string | null;
};

/** What the summary card says, straight from the client file. */
export type AccountHoldings = {
  trees: number;
  /** What they have paid so far, in millimes. Null means «we are not saying», never zero. */
  valueMillimes: number | null;
  /** The offer the trees stand in, named as the client knows it. */
  offerName: string | null;
  /** The card's one button. Null renders no button rather than one that opens nothing. */
  action: { label: string; href: string } | null;
};

/** One line of the menu: a section of the space, and whether it can be opened yet. */
export type AccountRow = {
  key: string;
  label: string;
  icon: AccountIcon;
  /** Null when the section has nowhere to go yet — the row is then not a link. */
  href: string | null;
  /** «يُبنى في دفعة قادمة», or whatever the owner wrote for a section that is not ready. */
  note: string | null;
};

type AccountScreenProps = {
  /** The screen's own title, «حسابي». */
  title: string;
  holder: AccountHolder | null;
  holdings: AccountHoldings | null;
  rows: readonly AccountRow[];
  /** The card's title, «زيتوناتي». */
  holdingsTitle: string;
  /** Unit of the count, «زيتونة». */
  treesLabel: string;
  /** What the card says instead of figures when there is no file to read. */
  emptyNote: string;
  /** The one door that is real for a reader with no file: the offers. */
  emptyAction?: { label: string; href: string } | null;
  /** Marks every figure on the card as a sample, so a preview can never be read as a client's real money. */
  sampleLabel?: string | null;
};

export function AccountScreen({
  title,
  holder,
  holdings,
  rows,
  holdingsTitle,
  treesLabel,
  emptyNote,
  emptyAction = null,
  sampleLabel = null,
}: AccountScreenProps) {
  return (
    /* A WHITE SHEET IN A BOLD SANS, which is the styling the owner settled on the offer screen the same day
       («match the new styling of the img»): his drawings are app screens, and an app screen is one white
       sheet with its type set in the interface face. The site's own cream ground is what a CARD sits on —
       it is the thing that makes a card read as an object — and Markazi is what a HEADLINE is set in. Carry
       either onto a screen like this and it reads as a web page, which is exactly what he kept calling
       ugly. Stated, not inherited, so nobody restores them thinking they were forgotten.

       `data-phone-screen` is the marker the shell reads: below md it takes the site header off a page that
       carries its own (globals.css, shared with the offer and catalogue screens). This screen opens with
       its own «حسابي» title and the tab bar carries the navigation, so a logo bar above it is a second
       header. Above md the site header stays, because there this is a page on a site again. */
    <div
      data-phone-screen=""
      className="mx-auto min-h-dvh w-full max-w-md bg-surface px-4 pb-section pt-cozy font-sans"
    >
      <h1 className="text-center text-[1.375rem] font-bold text-forest">{title}</h1>

      {/* Who this file belongs to. The greeting keeps the start of the row — the right, where the reading eye
          lands — and the mark closes it, which is the mock-up's own arrangement. A face we do not have is not
          drawn: the mark is the holder's own initial on the leaf ground, and with no holder it is the olive. */}
      <div className="mt-roomy flex items-center gap-snug">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-bold text-forest">
            {holder ? `أهلاً يا ${holder.name}` : "أهلاً بيك"}
          </p>
          {holder?.since ? <p className="text-caption text-muted">معانا منذ {formatMonthYear(holder.since)}</p> : null}
        </div>
        <span
          aria-hidden="true"
          className="grid size-14 flex-none place-items-center rounded-full bg-leaf-soft text-xl font-bold text-forest ring-1 ring-leaf/30"
        >
          {holder ? holder.name.trim().charAt(0) : <Icon name="trees" className="size-7 fill-forest" />}
        </span>
      </div>

      {/* The one object on the screen: what you hold. */}
      <section className="mt-roomy rounded-3xl bg-forest p-5 text-center text-surface shadow-[var(--shadow-card)]">
        {/* Above the title, where it is read before the figures and not after them. */}
        {sampleLabel ? (
          <p className="mb-tight">
            <span className="pill bg-gold-soft text-forest-700">{sampleLabel}</span>
          </p>
        ) : null}
        <h2 className="text-xl font-bold">{holdingsTitle}</h2>

        {holdings ? (
          <>
            {/* The count of trees first and the money second — the order the mock-up itself reads in, right to
                left, and the order of a product whose unit is the tree and whose price is what it cost. */}
            <div className="mt-cozy flex flex-wrap items-baseline justify-center gap-x-6 gap-y-1">
              <p className="text-[2rem] font-bold leading-none tabular-nums">
                {formatCount(holdings.trees)} <span className="text-2xl font-semibold">{treesLabel}</span>
              </p>
              {holdings.valueMillimes !== null ? (
                <p className="text-xl font-bold leading-none tabular-nums text-gold-bright">
                  {formatMillimes(holdings.valueMillimes)}
                </p>
              ) : null}
            </div>

            {holdings.offerName ? (
              <p className="mt-tight text-label text-surface/80">{holdings.offerName}</p>
            ) : null}

            {holdings.action ? (
              <Link
                href={holdings.action.href}
                className="btn mt-cozy w-full bg-surface text-forest hover:bg-leaf-soft"
              >
                {holdings.action.label}
              </Link>
            ) : null}
          </>
        ) : (
          <>
            {/* No door, so no figures. The card keeps its place and says why it is empty — a zero here would
                be a statement about a client's trees, and we have no client to make it about. */}
            <p className="mt-cozy leading-7 text-surface/85">{emptyNote}</p>
            {emptyAction ? (
              <Link href={emptyAction.href} className="btn mt-cozy w-full bg-surface text-forest hover:bg-leaf-soft">
                {emptyAction.label}
              </Link>
            ) : null}
          </>
        )}
      </section>

      {/* Everything the space keeps, one line each. A section that cannot be opened yet stays on the list and
          says so: the reader was promised a space, and is owed the shape of it.

          Rows on the sheet, not a panel floating on it. `.panel` is a white card with a shadow, which was
          right while this screen stood on cream and is invisible now that the sheet is white too — a white
          box on white, carrying a shadow for no reason. The drawing separates these rows with hairlines and
          nothing else. */}
      {rows.length > 0 ? (
        <ul className="mt-roomy divide-y divide-line border-y border-line">
          {rows.map((row) => (
            <li key={row.key}>
              <AccountRowBody row={row} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AccountRowBody({ row }: { row: AccountRow }) {
  const inner = (
    <>
      <span
        aria-hidden="true"
        className="grid size-10 flex-none place-items-center rounded-xl bg-leaf-soft text-forest"
      >
        <Icon name={row.icon} className="size-5 fill-current" />
      </span>
      <span className="min-w-0 flex-1 font-semibold">{row.label}</span>
      {row.note ? <StatusPill tone="line">{row.note}</StatusPill> : null}
      {row.href ? (
        // The page is RTL, so forward is left and the chevron points left. It is decoration: the link is the
        // whole row and the label is what a screen reader announces.
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-5 flex-none fill-none stroke-current stroke-2 text-line-strong">
          <path d="M14.5 6 8.5 12l6 6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </>
  );

  const shape = "flex min-h-14 w-full items-center gap-snug py-3 text-start";

  if (!row.href) {
    return <div className={`${shape} text-muted`}>{inner}</div>;
  }

  return (
    <Link href={row.href} className={`${shape} transition-colors hover:bg-leaf-soft/50`}>
      {inner}
    </Link>
  );
}
