-- 0107 · The owner's status words reach the client's screen.
--
-- THE BUG, AND IT IS A QUIET ONE. فضاء «زيتونتي» is a PUBLIC page: it renders with getPublicConfig(), which
-- carries only the settings rows marked `is_public`. Nine label rows the client screen needs are marked
-- false:
--
--   reservations.status_labels        «محجوزة — في انتظار العربون» · «العربون تخلّص» · …
--   payments.kind_labels              «عربون» · «تسبقة» · «قسط»
--   contracts.status_labels           «عقد في طور الإمضاء» · «ممضى» · «تخلّص»
--   installments.line_status_labels   «تخلّص» · «ما تخلّصش» · «تخلّص جزء منّو»
--   visits.status_*                   five rows, one per state
--
-- So the screen falls back to a copy of those words written into the TypeScript. Nothing looks broken —
-- which is the whole problem. The owner opens الإعدادات, renames «عربون» to something he prefers, saves,
-- and the client's screen keeps printing the old word forever, with no error and nothing to notice. Two
-- sources of one vocabulary, and the one he can edit is the one nobody reads.
--
-- WHY `is_public` WAS FALSE, and why that was right at the time: these rows were seeded by modules whose
-- only readers were Back Office screens (0063, 0064, 0072), and `is_public` is not a style choice — it is
-- what a stranger can fetch from the public config. Keeping the surface small by default is correct.
--
-- WHY IT IS SAFE TO OPEN THESE NINE, stated precisely rather than waved at. Every one of them is a DISPLAY
-- WORD for an enum value that is already visible to the person it concerns: a buyer reading their own file
-- sees «العربون تخلّص» because their عربون was paid, and the enum value behind it (`deposit_paid`) is in the
-- payload my_zitounti_file already sends them. Publishing the map publishes the ARABIC FOR A WORD, not a
-- row, not an amount and not whose it is. A stranger who fetches the public config learns that AgriZed has
-- a reservation state called «انتهت مدّتها» — which the public offers page implies anyway.
--
-- WHAT IS NOT OPENED: nothing else. No threshold, no amount, no internal note, no margin, no CRM status.
-- The `journey.stage_*` labels stay private too — /track prints the stage labels it is HANDED by
-- track_request, which is a security-definer function deciding what a stranger may see, and that is a
-- stronger place for the decision than a public settings row.
--
-- AFTER THIS the TypeScript fallback maps in sections.tsx become what they were always described as: a last
-- resort for a value nobody has named, not the thing that is actually printed.

do $guard$
declare
  v_missing text;
begin
  select string_agg(k, ', ') into v_missing
  from unnest(array['reservations.status_labels', 'payments.kind_labels', 'contracts.status_labels',
                    'installments.line_status_labels']) k
  where not exists (select 1 from public.settings s where s.key = k);
  if v_missing is not null then
    raise exception
      'these label rows do not exist yet: %. Apply the migrations that seed them (0063, 0064, 0072) first.', v_missing;
  end if;
end $guard$;

update public.settings
   set is_public = true
 where key in ('reservations.status_labels', 'payments.kind_labels',
               'contracts.status_labels', 'installments.line_status_labels')
    or key like 'visits.status\_%';

do $verify$
declare
  v_private text;
  v_opened  integer;
begin
  select count(*) into v_opened
  from public.settings
  where is_public
    and (key in ('reservations.status_labels', 'payments.kind_labels',
                 'contracts.status_labels', 'installments.line_status_labels')
         or key like 'visits.status\_%');

  select string_agg(key, ', ') into v_private
  from public.settings
  where not is_public
    and (key in ('reservations.status_labels', 'payments.kind_labels',
                 'contracts.status_labels', 'installments.line_status_labels')
         or key like 'visits.status\_%');

  if v_private is not null then
    raise exception 'these status vocabularies are still unreadable by the client screen: %', v_private;
  end if;

  -- A number, so that a future edit narrowing the WHERE clause is visible in the run rather than silent.
  raise notice '% status label rows are now readable by the public client screen', v_opened;
end $verify$;
