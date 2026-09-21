import { formatCount } from "@/lib/format";

/**
 * The four tiles under the hero card on a phone (owner, 2026-09-21, from an AgriZed app mock-up): the trees,
 * the people, the land and the reach.
 *
 * THE MOCK-UP'S FIGURES ARE NOT OURS AND ARE NOT USED. It reads «+317,800 زيتونة», «+12,450 مستثمر»,
 * «+18,250 هكتار». The real ones, read from the database at render time, are 8,600 trees across the published
 * offers, 20 people, 28 hectares. Only «24 ولاية» was already true. A mock-up invents numbers to show a shape,
 * which is what a mock-up is for; a page that prints them is telling a visitor something untrue on the screen
 * where they decide whether this is real — and this product answers that question with «بلا وعود».
 *
 * So the shape is the mock-up's and every figure is the database's. A tile whose figure has no honest source is
 * not rendered at all rather than shown as a zero, because «0 مستثمر» and «we do not count that» are different
 * statements and only one of them is true.
 */
export type AppStat = {
  /** What it counts, e.g. «زيتونة». */
  label: string;
  /** The figure itself, or null when nothing honest answers it — the tile is then dropped. */
  value: number | null;
  /** «+» before the figure, for a count that keeps growing. Never on a fixed one like the governorates. */
  growing?: boolean;
  icon: "tree" | "people" | "land" | "place";
};

const ICONS: Record<AppStat["icon"], React.ReactNode> = {
  tree: (
    <path d="M12 3c-2.2 0-4 1.8-4 4 0 .3 0 .6.1.8A3.5 3.5 0 0 0 6 11c0 1.9 1.6 3.5 3.5 3.5H11V21h2v-6.5h1.5C16.4 14.5 18 12.9 18 11a3.5 3.5 0 0 0-2.1-3.2c.1-.2.1-.5.1-.8 0-2.2-1.8-4-4-4Z" />
  ),
  people: (
    <path d="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.5 1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3 19a6 6 0 0 1 12 0v1H3v-1Zm13.5-4.5c2.5 0 4.5 1.7 4.5 4V20h-4.2v-1a7.4 7.4 0 0 0-1.6-4.6c.4-.1.8-.1 1.3-.1Z" />
  ),
  land: <path d="M3 18 8.5 9l4 5.5L15 11l6 7H3Zm3.5-9A2.25 2.25 0 1 0 6.5 4.5a2.25 2.25 0 0 0 0 4.5Z" />,
  place: <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />,
};

export function AppStats({ stats }: { stats: readonly AppStat[] }) {
  const shown = stats.filter((stat) => stat.value !== null);
  if (shown.length === 0) return null;

  return (
    <section className="grid grid-cols-2 gap-snug px-4 pt-cozy md:hidden">
      {shown.map((stat) => (
        <div key={stat.label} className="card flex flex-col items-center gap-1 p-4 text-center">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7 fill-forest">
            {ICONS[stat.icon]}
          </svg>
          <p className="font-display text-2xl font-bold leading-none text-forest tabular-nums">
            {stat.growing ? "+" : ""}
            {formatCount(stat.value as number)}
          </p>
          <p className="text-caption text-muted">{stat.label}</p>
        </div>
      ))}
    </section>
  );
}
