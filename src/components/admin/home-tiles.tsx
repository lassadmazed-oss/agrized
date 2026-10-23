import Link from "next/link";

import { NavIcon } from "./nav-icons";
import type { NavItem } from "./nav-model";

/*
 * الأقسام — the whole Back Office as one centred grid of squares.
 *
 * The owner, 2026-10-23: «نحب إكسبيريونس أسهل في الباك أوفيس — سامبل واضحة، كل شيء موجود في الوسطى، واخدم
 * على الكارو».
 *
 * WHAT WAS HARD ABOUT THE OLD DOOR. There are about twenty sections, and the only way to see them was a
 * dark-green sidebar on the left of a wide screen, or a menu behind an icon on a phone — one narrow column
 * of small words, with a workspace switcher above it deciding which third of them you were even shown. A
 * reader who wanted الأقساط had to know which job it belongs to before they could look for it. Here they
 * are all on the screen at once, in the middle, each one a square big enough for a thumb.
 *
 * IT DECIDES NOTHING FOR ITSELF. The rows arrive already filtered by the reader's roles and the modules'
 * states (../../app/admin/(panel)/panel-rows.ts, the same builder the sidebar uses). A section this reader
 * may not open is not here; a section whose module is off is drawn quiet and keeps its badge, because
 * something switched off must never look like something live.
 *
 * ONE TILE PER SECTION, EVEN THOUGH A ROW CAN BELONG TO TWO JOBS. «الحجوزات والعربون» is the commercial's
 * hold and the dinar Finance waits for, so workspaces.ts lists it twice on purpose — right for a sidebar
 * that draws one job at a time, wrong for a launcher that draws them all at once, where it would simply be
 * the same square printed three times. First workspace wins, which keeps each section under the job that
 * owns it.
 */
export function HomeTiles({ groups }: { groups: { key: string; label: string; items: NavItem[] }[] }) {
  const seen = new Set<string>();
  const sections = groups
    .map((group) => ({
      key: group.key,
      label: group.label,
      items: group.items.filter((item) => {
        if (seen.has(item.href)) return false;
        seen.add(item.href);
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  if (sections.length === 0) return null;

  return (
    <nav aria-label="أقسام الـBack Office" className="mx-auto w-full max-w-4xl space-y-5">
      {sections.map((group) => (
        <section key={group.key}>
          <h2 className="text-center text-[0.6875rem] font-semibold tracking-wide text-muted">{group.label}</h2>
          {/* THREE squares on a phone and not two, checked at 375px before it was written: two made each
              tile 165px tall, so four sections filled the screen and twenty-odd of them were a scroll with
              no end — which is the opposite of what was asked for. Three fits a whole workspace in three
              rows. The grid is the layout: nothing to scroll sideways, same order at every width. */}
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`card flex aspect-square flex-col items-center justify-center gap-1.5 p-2 text-center transition-colors hover:bg-paper ${
                    item.off ? "opacity-60" : ""
                  }`}
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-leaf-soft text-forest">
                    <NavIcon name={item.icon} className="size-4" />
                  </span>
                  <span className="text-[0.6875rem] font-semibold leading-tight text-balance text-ink">
                    {item.label}
                  </span>
                  {item.badge ? <span className="text-[0.625rem] leading-none text-muted">{item.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
