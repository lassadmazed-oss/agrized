-- 0165 · «زيتونتك عبر السنين»: the milestones and the words the last screen of /start reads.

do $$
declare
  v_line jsonb;
  v_prev integer := -1;
begin
  assert jsonb_typeof((select value from public.settings where key = 'start.timeline')) = 'array',
    'the milestones are a list';
  for v_line in select jsonb_array_elements(value) from public.settings where key = 'start.timeline' loop
    assert (v_line->>'years')::integer > v_prev, 'the milestones go forward in time: ' || v_line::text;
    v_prev := (v_line->>'years')::integer;
    assert coalesce(v_line->'title'->>'ar', '') <> '' and coalesce(v_line->'line'->>'ar', '') <> '',
      'every milestone has a title and a line: ' || v_line::text;
    -- The line it does not cross: no money and no yield on a milestone.
    assert (v_line->'line'->>'ar') !~ '(د\.ت|دينار|كغ|كلغ|لتر|%)', 'a milestone promises no figure: ' || v_line::text;
  end loop;
  assert (select count(*) from public.translations where entity = 'setting' and entity_key = 'start.timeline') = 4,
    'the milestones are drafted in the four other languages';
  assert (select count(*) from public.settings where key in ('start.timeline_title', 'start.timeline_note',
          'start.timeline_age_label', 'start.timeline_age_then', 'start.timeline_title_fr', 'start.timeline_note_fr')) = 6,
    'the words exist, with their French twins';
  assert (select value #>> '{}' from public.settings where key = 'start.timeline_note') like '%تقديري%',
    'the timeline says it is an estimate';
end $$;
