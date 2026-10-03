# AgriZed

Tunisian platform for investing in olive groves according to each person's financial capacity.
The functional and technical specification (كراس الشروط) is the reference for every feature; requirement ids
such as `LEAD-04` or `RES-02` in code comments point to it.

**Status:** Lot 0 (foundation) and Lot 1 (phase 1, demand collection) are implemented. Phases 2 to 4 exist as
disabled feature flags only.

## Stack

- Next.js 16 (App Router, TypeScript, Tailwind CSS 4), Arabic RTL first, French-ready
- Supabase: PostgreSQL 17, Auth, Storage, Row Level Security (project in eu-west-1)
- Node.js 20.9 or later

## Setup

```bash
npm install
cp .env.example .env      # then fill in the values
npm run db:migrate        # apply supabase/migrations in order
npm run db:test           # database tests, always rolled back
npm run admin:create -- --email you@example.com --name "Your Name"
npm run dev               # http://localhost:3000, Back Office at /admin
```

`admin:create` creates the first Super Admin and prints a temporary password once. Other staff accounts are
created from the Back Office (Users).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run typecheck` | Route type generation and `tsc` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Applies pending SQL migrations (tracked in `app.schema_migrations`) |
| `npm run db:test` | Runs `supabase/tests/*.sql` inside transactions that are rolled back |
| `npm run db:types` | Regenerates `src/lib/supabase/database.types.ts` |
| `npm run admin:create` | Creates the first Super Admin |
| `npm run admin:password` | Sets a new password for an existing staff account |
| `npm run demo:projects` | Seeds 15 `DEMO-` projects with parcels, all `internal` (staff preview only); `-- --purge` removes them |
| `npm run i18n:check` | Proves every text key the code reads exists in `settings`, and prints translation coverage per language |

## Project structure

```
src/app/[lang]/(public)/ Public site, one route tree for five languages: home, /projects, /start, /register,
                         /land, /track, /zitounti (the client's space)
src/app/[lang]/layout.tsx  The site's root layout: <html lang dir> per language
src/app/admin/layout.tsx   The Back Office's own root layout (Arabic only)
src/app/admin/login/     Staff sign-in
src/app/admin/(panel)/   Back Office: dashboard, leads (CRM), land offers, modules, settings, lists, users, audit
src/components/          Shared UI (site, admin, brand)
src/lib/                 Supabase clients, auth and roles, cached public config, formatting, phone numbers
src/lib/i18n/            Languages: routing helpers, message formatting (plurals), server/client accessors
src/proxy.ts             Language routing for the site; session refresh and optimistic redirect for /admin
supabase/migrations/     Database schema, RLS policies, RPCs, seed configuration
supabase/tests/          SQL tests (intake rules, access rules, audit log)
supabase/data/           Tunisia governorates and delegations (INS 2024, 24 / 279)
scripts/                 Migration, test, type generation and admin bootstrap scripts
```

## Rules that apply everywhere

- **No business values in code (PRN-02).** Amounts, lists, texts, limits and module visibility live in the
  database (`settings`, `option_items`, `project_types`, `lead_statuses`, `feature_flags`) and are edited in
  the Back Office.
- **Money is stored as integer millimes** (1 TND = 1000 millimes).
- **Access is enforced by Row Level Security and security-definer RPCs**, not by hiding UI. The service-role
  key is used only on the server for public intake, uploads and account administration.
- **Schema changes go through numbered migrations** in `supabase/migrations`; never edit production by hand.
- **Important operations are written to `audit_logs`**, which is append-only.
- **Requests keep a snapshot** of the option values chosen at submission time.
- **The public counter shows real rows only (MIL-01).** «مشروع المليون زيتونة» sums the lower bound of
  the tree counts people actually chose, ignores duplicate requests, and adds nothing for "اقترحولي".
  The goal lives in the `million.goal` setting.
- **No picture path in code (MED-01).** Every photo of the public site is a row in `site_media`; the Back
  Office (`/admin/settings/media`) uploads it to the public `site-media` bucket and alternative text is
  required. An empty slot renders a branded drawing, never a broken frame.

## Languages (0109–0117)

The site speaks **العربية** (source language, right to left, at the root: `/projects`), **Français**, **Deutsch**,
**Italiano** and **English** (left to right, `/fr/projects`, `/de/…`, `/it/…`, `/en/…`). The Back Office stays
Arabic.

- **No visitor-facing words in code.** Every text is a row of `settings` (the site's own words are
  `ui.<area>.<name>`), read with `t(config, "ui.login.title", { minutes: 5 })` on the server, or `useT()` inside
  `<Texts prefixes>` on the client. Plurals use ICU syntax in the text itself (`{n, plural, one {…} other {…}}`).
  `npm run i18n:check` fails when the code reads a key that has no row.
- **Translations** live in `public.translations` (entity, key, field, language) — never Arabic, which stays in its
  source row. A missing one falls back along `locales.fallback_code` (e.g. de → en → fr → ar).
  `getPublicConfig()` returns settings, list labels, place names and pictures already resolved for the request's
  language; offers are resolved by `src/lib/public-projects.ts`.
- **Back Office:** `/admin/settings/translations` (every text in five fields; drafts are marked until saved) and
  `/admin/settings/languages` (on/off, names, order, fallback, coverage).
- **Links** in public code use `@/components/site/link` and `localePath()` so they keep the visitor's language.
- **Messages** go out in the recipient's language: `persons.preferred_locale` is recorded from the language of the
  page a public form was sent from (header `x-agrized-locale`, set by the proxy), by the language selector, or by
  staff on the lead file. Every SMS translation must fit one message (`app.sms_segments`, test 067).
- **Database display reads** that should answer in the visitor's language send `x-agrized-display-locale`
  (`displayHeaders()`, `createClient({ display })`). Intake calls never do: they snapshot labels for the staff.

## Not done yet

- SMS sending: messages are queued in `notification_outbox`; no provider is connected (decision D-05).
- Two-factor authentication for Finance, Legal and Admin roles (PERM-04).
- Invisible bot challenge (Cloudflare Turnstile) on public forms; honeypot and rate limits are active.
- Phases 2 to 4: projects and plots, visits, reservations, contracts, installments, Zitounti, harvest.
