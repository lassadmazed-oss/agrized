import {
  ChartColumn,
  FileText,
  HandHeart,
  Handshake,
  Leaf,
  MapPin,
  Search,
  Sprout,
  TreeDeciduous,
  Users,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  chart: ChartColumn,
  document: FileText,
  hand: HandHeart,
  handshake: Handshake,
  leaf: Leaf,
  people: Users,
  pin: MapPin,
  search: Search,
  sprout: Sprout,
  tree: TreeDeciduous,
};

type SiteIconProps = { code?: string | null; className?: string; strokeWidth?: number };

/**
 * An icon picked by a short code, so a list stored in settings can name its own ("icon": "leaf").
 * Unknown or missing codes draw a leaf rather than nothing.
 */
export function SiteIcon({ code, className = "size-6", strokeWidth = 1.75 }: SiteIconProps) {
  if (code === "olives") return <OlivesIcon className={className} strokeWidth={strokeWidth} />;
  const Icon = (code ? ICONS[code] : undefined) ?? Leaf;
  return <Icon className={className} strokeWidth={strokeWidth} aria-hidden="true" />;
}

/** Two olives on a twig, for the harvest; the icon set has no olive. */
function OlivesIcon({ className, strokeWidth }: { className: string; strokeWidth: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 3c0 3-1.5 5-4 6.5M12 3c0 3 1.5 5 4 6.5" />
      <path d="M12 3c2.5-1 4.5-.6 6 .8-1.8 1.2-3.8 1.2-6-.8z" />
      <ellipse cx="7.5" cy="15" rx="3.5" ry="4.8" transform="rotate(-12 7.5 15)" />
      <ellipse cx="16.5" cy="15" rx="3.5" ry="4.8" transform="rotate(12 16.5 15)" />
    </svg>
  );
}
