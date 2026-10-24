-- 0155 · a study that was saved, and that later settings cannot touch.
--
-- Its test is supabase/tests/102_study_records.sql (rolled back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0155_study_records.sql supabase/tests/102_study_records.sql
--
-- §8 of the 2026-10-24 brief: when a visitor finishes a study he gets three buttons — download it, register
-- his interest, book a visit — and if he registers, his file keeps «العرض المختار، عدد الزيتونات، كل
-- الفرضيات، النتائج، تاريخ الدراسة، نسخة إعدادات الحساب».
--
-- THE LAST OF THOSE IS THE WHOLE REASON THIS TABLE EXISTS, and §10 states it as a rule: «أي تعديل في
-- الإعدادات لا يغيّر الدراسات القديمة المحفوظة». A saved study that re-computed itself from today's
-- settings would quietly rewrite what a client was shown the day he decided — and the day a price is
-- corrected, every study in every file would change its mind at once. So the whole payload is STORED, as it
-- stood, and nothing in this schema ever updates it. There is no update path, there is no trigger, and 102
-- asserts that correcting a price afterwards leaves a saved study exactly as it was.
--
-- THE NUMBERS ARE COMPUTED HERE AND NEVER ACCEPTED FROM THE BROWSER. public.save_study takes the visitor's
-- ANSWERS — how many trees, how many years, which scenario — and runs the engine itself. A function that
-- stored a payload the page handed it would let anyone post a study claiming a 400% return with AgriZed's
-- name on it, which is the one thing a document a client downloads must not allow.
--
-- IT SAVES WITHOUT AN ACCOUNT, because §8's three buttons are offered to a visitor who has none. The study
-- stands on its own with a reference number; person_id and request_id are filled in later, when and if he
-- sends a request. A study nobody claims is a row that expires with the rest of the anonymous traffic.

create table public.study_records (
  id            uuid primary key default gen_random_uuid(),
  reference_no  text not null unique,

  project_id    uuid not null references public.projects (id) on delete cascade,
  /** Filled in when the study is claimed by a request. Null for a visitor who only looked. */
  person_id     uuid references public.persons (id) on delete set null,
  request_id    uuid references public.interest_requests (id) on delete set null,

  /** What he answered: trees, years, scenario, mode, payment. The question, kept beside the answer. */
  inputs        jsonb not null,
  /** The whole study as it was computed, the day it was computed. NEVER recomputed, NEVER updated. */
  payload       jsonb not null,
  /** The settings the engine read to produce it — §8's «نسخة إعدادات الحساب», so a figure can be explained
   *  years later even after every one of them has been corrected. */
  settings      jsonb not null,

  created_at    timestamptz not null default now(),
  /** Hashed, like every other anonymous write on this site: enough to rate-limit, not enough to identify. */
  ip_hash       text
);

comment on table public.study_records is
  'One profitability study as it was shown (§8). The payload and the settings behind it are stored, never recomputed: §10 forbids a later settings change from altering a saved study, and this table has no update path at all. The figures are computed by public.save_study and never accepted from the browser.';

create index study_records_person_idx  on public.study_records (person_id, created_at desc) where person_id is not null;
create index study_records_request_idx on public.study_records (request_id) where request_id is not null;
create index study_records_recent_idx  on public.study_records (project_id, created_at desc);

-- A saved study holds the client's own figures and the offer's. Staff read them; nobody writes by hand —
-- every row arrives through save_study, which computes what it stores.
alter table public.study_records enable row level security;

create policy study_records_staff_read on public.study_records for select to authenticated
  using ((select app.is_staff()));

revoke all on public.study_records from anon;

-- ---------------------------------------------------------------------------
-- Saving one
-- ---------------------------------------------------------------------------

-- The reference a client reads down the phone: AGZ-ET-2026-000001.
create sequence if not exists public.study_records_seq;

create or replace function public.save_study(
  p_project  uuid,
  p_trees    integer,
  p_years    integer,
  p_scenario text default null,
  p_mode     text default 'olives',
  p_payment  text default null,
  p_down     uuid default null,
  p_duration uuid default null,
  p_ip_hash  text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_study  jsonb;
  v_inputs jsonb;
  v_keep   public.study_records;
  v_ref    text;
begin
  if not app.module_open('study') then
    raise exception 'module_closed' using errcode = 'P0001';
  end if;

  -- THE ENGINE RUNS HERE. Nothing the browser sent is stored as a figure — only the question it asked.
  v_study := public.public_project_study(p_project, p_trees, p_years, p_scenario, p_mode, p_payment, p_down, p_duration);
  if v_study is null or (v_study->>'status') <> 'ok' then
    raise exception 'study_unavailable' using errcode = 'P0001';
  end if;

  v_inputs := jsonb_build_object(
    'trees', p_trees, 'years', p_years, 'scenario', p_scenario,
    'mode', p_mode, 'payment', p_payment, 'down_option_id', p_down, 'duration_option_id', p_duration);

  -- ONE PRESS, ONE ROW. A reader who taps «حمّل الدراسة» three times has not made three studies, and a
  -- table that thinks he has is a table nobody can read a client's file out of. The same question from the
  -- same place within the hour gives the same row back.
  if p_ip_hash is not null then
    select * into v_keep from public.study_records r
     where r.project_id = p_project and r.ip_hash = p_ip_hash and r.inputs = v_inputs
       and r.created_at > now() - interval '1 hour'
     order by r.created_at desc
     limit 1;
    if found then
      return jsonb_build_object('id', v_keep.id, 'reference_no', v_keep.reference_no);
    end if;
  end if;

  v_ref := 'AGZ-ET-' || to_char((now() at time zone 'Africa/Tunis'), 'YYYY') || '-' ||
           lpad((nextval('public.study_records_seq'))::text, 6, '0');

  insert into public.study_records (reference_no, project_id, inputs, payload, settings, ip_hash)
  values (
    v_ref, p_project, v_inputs, v_study,
    -- §8's copy of the settings. Read from the table rather than named one by one, so a setting added
    -- later is captured without this function being edited — and a study can still be explained in 2030.
    (select coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
       from public.settings s where s.key like 'study.%'),
    p_ip_hash)
  returning * into v_keep;

  return jsonb_build_object('id', v_keep.id, 'reference_no', v_keep.reference_no);
end $fn$;


revoke execute on function public.save_study(uuid, integer, integer, text, text, text, uuid, uuid, text) from public;
grant execute on function public.save_study(uuid, integer, integer, text, text, text, uuid, uuid, text) to anon, authenticated;

comment on function public.save_study(uuid, integer, integer, text, text, text, uuid, uuid, text) is
  'Saves one study and answers with its reference. It RUNS the engine rather than storing what the browser sent, so no one can file a study with AgriZed''s name on figures it did not produce. Open to a visitor with no account (§8); the same question from the same place within the hour returns the row already saved.';

-- ---------------------------------------------------------------------------
-- Claiming one
-- ---------------------------------------------------------------------------
--
-- A visitor studies an offer, then sends a request. The two are the same person and the file should say so,
-- which is §8: «إذا سجّل اهتمامه، نحتفظوا في ملفه بـ…». The request already knows whose it is, so this
-- copies the person off it rather than being told — a caller who could name the person could attach a
-- stranger's study to a stranger's file.
--
-- IT ONLY EVER FILLS A BLANK. A study already claimed is left alone: the first claim is the honest one, and
-- a study that could be re-pointed is a study whose file nobody can trust.

create or replace function public.claim_study(p_study uuid, p_request uuid) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare
  v_person uuid;
begin
  select r.person_id into v_person from public.interest_requests r where r.id = p_request;
  if v_person is null then
    return false;
  end if;

  update public.study_records s
     set person_id = v_person, request_id = p_request
   where s.id = p_study and s.person_id is null and s.request_id is null;

  return found;
end $fn$;

revoke execute on function public.claim_study(uuid, uuid) from public, anon;
grant execute on function public.claim_study(uuid, uuid) to authenticated;

comment on function public.claim_study(uuid, uuid) is
  'Attaches a saved study to the request that was sent from it, taking the person off the request rather than from the caller. Fills a blank only: a study already claimed is never re-pointed.';

-- ---------------------------------------------------------------------------
-- Reading a client's studies, for §8's last line
-- ---------------------------------------------------------------------------

create or replace function public.staff_person_studies(p_person uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
begin
  if not app.is_staff() then
    raise exception 'not_staff' using errcode = 'P0001';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', s.id,
             'reference_no', s.reference_no,
             'created_at', s.created_at,
             'request_id', s.request_id,
             'project_code', p.code,
             'project_name', p.name,
             'inputs', s.inputs,
             -- The headline figures only. A commercial on the phone wants what the client was told, and
             -- the whole payload is a hundred lines of table they would have to read past to find it.
             'trees', s.payload->'trees',
             'years', s.payload->'years',
             'totals', s.payload->'totals',
             'investment', s.payload->'investment'
           ) order by s.created_at desc), '[]'::jsonb)
      from public.study_records s
      join public.projects p on p.id = s.project_id
     where s.person_id = p_person);
end $fn$;

revoke execute on function public.staff_person_studies(uuid) from public, anon;
grant execute on function public.staff_person_studies(uuid) to authenticated;

comment on function public.staff_person_studies(uuid) is
  'The studies in one client''s file, newest first, as §8 asks the Back Office to show them — the question, the date and the headline figures, not the hundred-line table behind them.';
