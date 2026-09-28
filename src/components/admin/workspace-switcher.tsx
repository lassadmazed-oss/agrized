"use client";

// The workspace switcher, and the one place that decides which workspace is on screen.
//
// WHY THIS IS A CLIENT COMPONENT. The second rule of `resolveWorkspace` — «the workspace whose rows contain
// the current path» — needs the pathname, and a server layout receives none: it renders once for every page
// beneath it and is told nothing about which. usePathname() is the only honest source, and it is client-side.
// So the layout resolves nothing; it hands this component every workspace the session holds, each with its
// already-gated sidebar rendered (an <AdminNav>, passed as a node the way any server-decided UI is passed to
// a client component), plus the cookie, and this component picks one. Who may see a row, and whether its
// module is on, were settled on the server in layout.tsx — the same split admin-nav.tsx already states for
// itself.
//
// The switcher is a <form> per workspace posting to the Server Action, not a set of buttons wired to a
// click handler: the form works before hydration and without JavaScript, and the cookie is written by the
// server, which is the only place a cookie can be written (a rendering component cannot).

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { resolveWorkspace, type WorkspaceKey } from "./workspaces";

export type WorkspacePanel = {
  key: WorkspaceKey;
  label: string;
  /** The hrefs of the rows that survived their gates, for the pathname rule. */
  hrefs: readonly string[];
  /** That workspace's sidebar, rendered by the layout. */
  nav: ReactNode;
};

type ChooseWorkspace = (formData: FormData) => Promise<void>;

/**
 * One workspace's sidebar, with the switcher above it when there is anything to switch to. A reader who holds
 * one workspace gets its rows and no switcher: a segmented control with one segment is a label pretending to
 * be a choice.
 */
export function WorkspaceNav({
  panels,
  cookie,
  action,
  className = "",
}: {
  panels: readonly WorkspacePanel[];
  cookie: string | null;
  action: ChooseWorkspace;
  className?: string;
}) {
  const pathname = usePathname() ?? "/admin";
  const active = resolveWorkspace(
    panels.map((panel) => ({ key: panel.key, rows: panel.hrefs })),
    { cookie, pathname },
  );
  const current = panels.find((panel) => panel.key === active) ?? panels[0];
  if (!current) return null;

  return (
    <div className={`flex flex-col gap-5 ${className}`.trim()}>
      {panels.length > 1 ? <WorkspaceSwitcher panels={panels} active={current.key} action={action} /> : null}
      {current.nav}
    </div>
  );
}

/*
 * The segmented row. The active workspace sits on paper (the same chip the wordmark sits on), the rest stay
 * on the sidebar's green in paper/80 — quieter than the rows below them, because this control is asked once a
 * day and the rows are read all day.
 */
// `whitespace-nowrap`, never `truncate`: a workspace NAME clipped to «…» is a button nobody can read, and
// with five of them the 15rem sidebar cannot give each one its ~41px (IBM Plex Sans Arabic 600 at 12px
// needs that for «المبيعات»). So the segments WRAP onto a second row instead of shrinking — see the group.
const SEGMENT = "w-full whitespace-nowrap rounded-md px-2 py-1 text-xs font-semibold transition-colors";

export function WorkspaceSwitcher({
  panels,
  active,
  action,
}: {
  panels: readonly WorkspacePanel[];
  active: WorkspaceKey;
  action: ChooseWorkspace;
}) {
  return (
    <div role="group" aria-label="مساحات العمل" className="flex flex-wrap gap-1 rounded-lg bg-forest p-1">
      {panels.map((panel) => {
        const isActive = panel.key === active;
        // A real flex-basis, so the row can wrap. `flex-1` was basis-0: every segment shrank to a fifth of
        // the width and the wrap never fired, which is how the names ended up as five ellipses.
        return (
          <form key={panel.key} action={action} className="basis-[calc(50%-0.125rem)] grow">
            <input type="hidden" name="workspace" value={panel.key} />
            <button
              type="submit"
              aria-current={isActive ? "true" : undefined}
              className={`${SEGMENT} ${isActive ? "bg-paper text-forest" : "text-paper/80 hover:bg-forest-600 hover:text-paper"}`}
            >
              {panel.label}
            </button>
          </form>
        );
      })}
    </div>
  );
}
