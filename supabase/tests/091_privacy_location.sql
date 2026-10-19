-- 0144 · the privacy policy covers location, because the app asks for it.

do $$
declare
  v_sections jsonb := (select value from public.settings where key = 'legal.privacy_sections');
  v_body     text;
begin
  assert jsonb_typeof(v_sections) = 'array', 'the policy is still a list of sections';

  select s ->> 'body' into v_body
    from jsonb_array_elements(v_sections) as s
   where s ->> 'title' = 'موقعك';

  assert v_body is not null,
    'the policy has a location section; the app declares ACCESS_FINE_LOCATION and a silent policy is a mismatch a reviewer finds in seconds';

  -- The claim that earns the Data Safety answer «not collected»: it must actually be written down.
  assert v_body like '%ما يوصلناش%' or v_body like '%ما نسجّلوهش%',
    'the location section says the position never reaches us, which is what both store forms are told';

  -- Exactly one such section: the update is idempotent, and a second run must not append a duplicate.
  assert (select count(*) from jsonb_array_elements(v_sections) as s where s ->> 'title' = 'موقعك') = 1,
    'the location section appears once';

  -- Nothing else was lost while rebuilding the array.
  assert (select count(*) from jsonb_array_elements(v_sections) as s
           where s ->> 'title' in ('شنوّة نجمعو','علاش نجمعوها','مع من نشاركوها','قدّاش نحتفظو بيها','حقوقك','الأطفال')) = 6,
    'the six original sections survived';
end $$;

-- A policy whose date predates what it describes reads as untended.
do $$
begin
  assert (select (s.value #>> '{}')::date from public.settings s where s.key = 'legal.privacy_updated_at')
         >= date '2026-10-19',
    'the policy date moved when the policy did';
end $$;
