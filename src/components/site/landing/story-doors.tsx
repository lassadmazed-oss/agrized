import Link from "@/components/site/link";
import { StoryIcon } from "@/components/site/story-icon";
import { optionsFor, settingJson, t, type PublicConfig } from "@/lib/config";

/**
 * «لمن الزيتونة؟» on the home page (0164, owner 2026-11-17: «نحب الحكاية تتحكى في الانترفاس … نخلقو الفكرة في
 * راسه»). Before a price, the page asks whose tree it would be — for me, my child, my parents, a gift, my family
 * from abroad — and each answer is a door into /start with that answer already given, so the calculator opens on
 * the tree count with the visitor's own story in hand.
 *
 * Everything on it is the owner's: the answers are the list `tree_for` (Back Office → القوائم), each line is its
 * pair in `start.for_lines`, the heading and its sentence are `home.for_title` / `home.for_subtitle`. An empty
 * list draws nothing.
 */
export function StoryDoors({ config }: { config: PublicConfig }) {
  const answers = optionsFor(config, "tree_for");
  if (answers.length === 0) return null;
  const lines = settingJson<Record<string, Record<string, unknown>>>(config, "start.for_lines", {});
  const line = (code: string | null) => {
    const pair = code ? lines[code] : undefined;
    const value = pair?.[config.locale] ?? pair?.ar;
    return typeof value === "string" && value.trim() ? value : null;
  };
  const title = t(config, "home.for_title");
  const subtitle = t(config, "home.for_subtitle");

  return (
    <section aria-labelledby="story-doors-title" className="mt-6 md:mt-10">
      <h2 id="story-doors-title" className="font-display text-2xl font-bold leading-tight text-forest md:text-4xl">
        {title}
      </h2>
      {subtitle ? <p className="mt-1.5 max-w-2xl leading-7 text-muted md:mt-2 md:text-lg">{subtitle}</p> : null}
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2 md:mt-6 md:gap-4 lg:grid-cols-5">
        {answers.map((answer) => {
          const text = line(answer.code);
          return (
            <li key={answer.id}>
              <Link
                href={`/start?for=${encodeURIComponent(answer.id)}`}
                className="group flex h-full items-start gap-3 rounded-3xl border border-line bg-surface p-4 shadow-[0_1px_2px_rgb(27_42_31/0.05)] transition-colors hover:border-forest/30 hover:bg-leaf-soft lg:flex-col lg:p-5"
              >
                <span className="grid size-11 flex-none place-items-center rounded-full bg-leaf-soft text-forest transition-colors group-hover:bg-surface">
                  <StoryIcon code={answer.code} />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg font-bold leading-tight text-forest">{answer.label}</span>
                  {text ? <span className="mt-1 block text-sm leading-6 text-muted">{text}</span> : null}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
