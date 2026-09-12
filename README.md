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

## Project structure

```
src/app/(public)/        Public site: home, /register (step-by-step form), /simulator, /land
src/app/admin/login/     Staff sign-in
src/app/admin/(panel)/   Back Office: dashboard, leads (CRM), land offers, modules, settings, lists, users, audit
src/components/          Shared UI (site, admin, brand)
src/lib/                 Supabase clients, auth and roles, cached public config, formatting, phone numbers
src/proxy.ts             Session refresh and optimistic redirect for /admin
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

## Not done yet

- SMS sending: messages are queued in `notification_outbox`; no provider is connected (decision D-05).
- Two-factor authentication for Finance, Legal and Admin roles (PERM-04).
- Invisible bot challenge (Cloudflare Turnstile) on public forms; honeypot and rate limits are active.
- Phases 2 to 4: projects and plots, visits, reservations, contracts, installments, Zitounti, harvest.
