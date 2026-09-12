@AGENTS.md

# AgriZed

Arabic-first (RTL) platform for investing in olive groves. The specification (كراس الشروط) defines every
feature; requirement ids in comments (`LEAD-04`, `PRN-02`…) refer to it. See README.md for setup and structure.

## Commands

- `npm run typecheck` and `npm run lint` after code changes.
- `npm run db:migrate`, then `npm run db:types` after adding a migration; `npm run db:test` for SQL tests.

## Rules

- Never hard-code business values (amounts, lists, texts, limits, module visibility). Read them from
  `settings`, `option_items`, `project_types`, `lead_statuses` or `feature_flags` via `src/lib/config.ts`.
- Money is stored as integer millimes. Dates are shown in Africa/Tunis.
- Enforce access in the database (RLS, security-definer RPCs with role checks), then check roles again in each
  Server Action with `requireStaff()`. Use the service-role client only on the server for public intake,
  uploads and account administration.
- Schema changes only through a new numbered file in `supabase/migrations`, with tests in `supabase/tests`.
- User-facing copy is Arabic; errors say what went wrong and how to fix it.
- Do not create user accounts yourself; the owner runs `npm run admin:create` or uses the Back Office.
