/**
 * The drawing of each «لمن الزيتونة؟» answer (0164), by its list code (`tree_for`): for me, my child, my
 * parents, a gift, my family from abroad. A code the owner adds later gets the tree, so a new answer is never
 * drawn blank. Shared by the home page's doors and the first screen of /start.
 */
export function StoryIcon({ code, className = "size-6" }: { code: string | null; className?: string }) {
  const common = {
    viewBox: "0 0 24 24",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
  switch (code) {
    case "self":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "child":
      return (
        <svg {...common}>
          <circle cx="12" cy="7" r="2.5" />
          <path d="M8 21v-4l-2-3 3-3h6l3 3-2 3v4" />
        </svg>
      );
    case "parent":
      return (
        <svg {...common}>
          <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />
        </svg>
      );
    case "gift":
      return (
        <svg {...common}>
          <rect x="4" y="9" width="16" height="11" rx="1.5" />
          <path d="M3 9h18M12 9v11M12 9c-1.5-3-5-3.5-5-1.5S10 9 12 9Zm0 0c1.5-3 5-3.5 5-1.5S14 9 12 9Z" />
        </svg>
      );
    case "abroad":
      return (
        <svg {...common}>
          <path d="M3 14 21 7l-4 12-5-4-3 4v-5l8-7" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 21v-7" />
          <path d="M12 14c-4 0-7-3-7-7 4 0 7 3 7 7Zm0 0c4 0 7-3 7-7-4 0-7 3-7 7Z" />
        </svg>
      );
  }
}
