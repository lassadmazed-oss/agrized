import Link from "next/link";

import { NavIcon } from "@/components/admin/nav-icons";
import { ADMIN_LABELS, type AdminIconKey } from "@/components/admin/nav-model";

/**
 * The rooms of الإعدادات, one strip at the head of each: النصوص والأرقام, the modules, the lists, the
 * pictures — and since 0109 the translations and the languages. They are one job, so each can reach the others.
 */
const ROOMS: { href: string; label: string; icon: AdminIconKey }[] = [
  { href: "/admin/settings", label: "النصوص والأرقام", icon: "settings" },
  { href: "/admin/settings/translations", label: ADMIN_LABELS["/admin/settings/translations"], icon: "translations" },
  { href: "/admin/settings/languages", label: ADMIN_LABELS["/admin/settings/languages"], icon: "languages" },
  { href: "/admin/settings/modules", label: ADMIN_LABELS["/admin/settings/modules"], icon: "modules" },
  { href: "/admin/settings/lists", label: ADMIN_LABELS["/admin/settings/lists"], icon: "lists" },
  { href: "/admin/settings/media", label: ADMIN_LABELS["/admin/settings/media"], icon: "media" },
];

export function SettingsRooms({ current }: { current: string }) {
  return (
    <nav aria-label="أقسام الإعدادات" className="flex flex-wrap gap-tight">
      {ROOMS.map((room) => (
        <Link key={room.href} href={room.href} className="chip" aria-current={room.href === current ? "true" : undefined}>
          <NavIcon name={room.icon} className="size-4" />
          {room.label}
        </Link>
      ))}
    </nav>
  );
}
