-- A Tunisian living abroad can say so, and it is written down.
-- Owner 2026-10-03 («add the option if you are من المواطنين بالخارج»); migration 0121.
--
-- The point of the test is that the answer SURVIVES: a question whose answer is displayed and then dropped is
-- worse than no question, because the commercial reads the lead and sees nothing. So it is asserted on both
-- rows the intakes write — the person, and the request's snapshot — through both intakes.
--
-- Runs against the live database inside a rolled-back transaction.

create function pg_temp.ab_payload(p_overrides jsonb) returns jsonb language sql as $$
  select jsonb_build_object(
    'full_name', 'تونسي بالخارج',
    'phone_e164', '+21698770001',
    'residence_governorate_id', 34,
    'invest_governorate_ids', jsonb_build_array(34),
    'goal_option_id', (select id from public.option_items where list_key = 'goal' and is_active order by sort_order limit 1),
    'contact_channel', 'whatsapp',
    'consent_text', 'أوافق',
    'source', jsonb_build_object('utm_source', 'test')
  ) || p_overrides
$$;

-- ---------------------------------------------------------------------------
-- 1 · the columns, and what they mean when nobody answered
-- ---------------------------------------------------------------------------

do $$
declare
  v_col information_schema.columns;
begin
  foreach v_col.table_name in array array['persons', 'interest_requests'] loop
    select * into v_col from information_schema.columns
    where table_schema = 'public' and table_name = v_col.table_name and column_name = 'lives_abroad';

    if v_col.column_name is null then
      raise exception 'public.% has no lives_abroad column', v_col.table_name;
    end if;
    if v_col.is_nullable <> 'NO' then
      raise exception '%.lives_abroad must not be nullable: «did not tick it» is false, not unknown', v_col.table_name;
    end if;
    if v_col.column_default not like 'false%' then
      raise exception '%.lives_abroad must default to false, got %', v_col.table_name, v_col.column_default;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2 · the calculator intake keeps the answer, on the request and on the person
-- ---------------------------------------------------------------------------

do $$
declare
  v_result  jsonb;
  v_request public.interest_requests;
  v_person  public.persons;
begin
  v_result := public.submit_interest_request(pg_temp.ab_payload('{"lives_abroad": true}'));
  select * into v_request from public.interest_requests where request_no = v_result->>'request_no';
  select * into v_person from public.persons where id = v_request.person_id;

  if not v_request.lives_abroad then
    raise exception 'the request did not keep «من المواطنين بالخارج»';
  end if;
  if not v_person.lives_abroad then
    raise exception 'the person did not keep «من المواطنين بالخارج»';
  end if;
  -- The governorate is still asked and still stored: someone abroad names the one they are from, and the
  -- matching reads that column.
  if v_request.residence_governorate_id is null then
    raise exception 'the governorate must still be recorded for someone living abroad';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3 · not ticking it is a «no», not a missing value
-- ---------------------------------------------------------------------------

do $$
declare
  v_result jsonb;
  v_abroad boolean;
begin
  v_result := public.submit_interest_request(
    pg_temp.ab_payload('{"phone_e164": "+21698770002"}')
  );
  select lives_abroad into v_abroad from public.interest_requests where request_no = v_result->>'request_no';
  if v_abroad is null then
    raise exception 'an unanswered question must be false, not null';
  end if;
  if v_abroad then
    raise exception 'a payload without the key must not be read as «lives abroad»';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4 · the offer intake keeps it too — the diaspora buys offers, not only calculators
-- ---------------------------------------------------------------------------

do $$
declare
  v_project uuid := (select id from public.projects where status = 'published' and tree_count > 10 order by code limit 1);
  v_result  jsonb;
  v_abroad  boolean;
begin
  if v_project is null then
    raise exception 'no published offer to test the offer intake against';
  end if;

  v_result := public.submit_offer_request(jsonb_build_object(
    'full_name', 'تونسي بالخارج',
    'phone_e164', '+21698770003',
    'residence_governorate_id', 34,
    'contact_channel', 'phone',
    'consent_text', 'أوافق',
    'project_id', v_project::text,
    'trees', '5',
    'lives_abroad', true
  ));

  select lives_abroad into v_abroad from public.interest_requests where request_no = v_result->>'request_no';
  if not v_abroad then
    raise exception 'the offer intake dropped «من المواطنين بالخارج»';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5 · the question has words, and they reach every language the site speaks
-- ---------------------------------------------------------------------------

do $$
declare
  v_key    text;
  v_keys   text[] := array[
    'ui.register.abroad_label', 'ui.register.abroad_hint',
    'ui.register.abroad_governorate_label', 'ui.offer.form_abroad_label'
  ];
  v_locale text;
  v_row    public.settings;
  v_n      integer;
begin
  foreach v_key in array v_keys loop
    select * into v_row from public.settings s where s.key = v_key;
    if v_row.key is null then raise exception 'missing text: %', v_key; end if;
    if not v_row.is_public then
      raise exception '% is not public, so the page would fall back to a hard-coded string', v_key;
    end if;
    if v_row.group_key <> 'ui' then
      raise exception '% must sit in the ui group with the rest of the interface text, got %', v_key, v_row.group_key;
    end if;

    foreach v_locale in array array['fr', 'de', 'it', 'en'] loop
      select count(*) into v_n from public.translations t
      where t.entity = 'setting' and t.entity_key = v_key and t.field = 'value' and t.locale = v_locale;
      if v_n = 0 then
        raise exception 'no % translation for %', v_locale, v_key;
      end if;
    end loop;
  end loop;
end $$;
