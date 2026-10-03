-- تعدّد اللغات — five languages, one source of truth, the client's language on every message.
-- Migration supabase/migrations/0109_i18n.sql.
--
-- Runs against the live database inside a rolled-back transaction. Every assertion is scoped to fixtures this
-- file creates (a setting, a template, persons on unused numbers), so real translations can neither hide a
-- failure nor cause one — except section 8, which deliberately measures EVERY translated SMS that exists.
--
--   1 · THE LANGUAGES        five, Arabic always on and the end of every chain; a cycle is refused.
--   2 · WHAT IS REFUSED      an Arabic translation, a blank, an unknown field, a shape that is not the source's.
--   3 · THE CHAIN            de → en → fr → ar, nearest first; a label map merges word by word.
--   4 · DISPLAY IS OPT-IN    app.setting_text answers in French only when the display header says so.
--   5 · THE CLIENT'S LANGUAGE recorded by a public request, untouched by a staff one, set by the client.
--   6 · THE MESSAGE          goes out in the recipient's language, with the unit rewritten.
--   7 · WHO READS WHAT       anon reads public translations, not internal ones; nobody but an admin writes.
--   8 · ONE SMS              every translated SMS that exists fits one message at its worst case.

do $$
begin
  if to_regclass('public.translations') is null then
    raise exception
      'supabase/migrations/0109_i18n.sql is not applied yet, and this test file belongs to it. Dry-run both together: node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0109_i18n.sql supabase/tests/067_i18n.sql';
  end if;
end $$;

create function pg_temp.i18n_expect(p_sql text, p_expected text) returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'expected error "%" but the call succeeded: %', p_expected, p_sql;
exception when others then
  if sqlerrm not like '%' || p_expected || '%' then
    raise exception 'expected error "%" but got "%" from: %', p_expected, sqlerrm, p_sql;
  end if;
end $$;

-- Every language this file reads is pinned: switched on, with the seeded fallbacks.
update public.locales set is_enabled = true where code in ('fr', 'de', 'it', 'en');
update public.locales set fallback_code = 'ar' where code = 'fr';
update public.locales set fallback_code = 'fr' where code = 'en';
update public.locales set fallback_code = 'en' where code in ('de', 'it');

-- Fixtures: a text setting, a label map, an SMS template.
insert into public.settings (key, value, value_type, group_key, label_ar, is_public) values
  ('test_i18n.text', to_jsonb('نص عربي'::text), 'text', 'test', 'نص اختبار', true),
  ('test_i18n.map',  '{"a": "أ", "b": "ب", "c": "ج"}'::jsonb, 'json', 'test', 'خريطة اختبار', true),
  ('test_i18n.secret', to_jsonb('سرّ'::text), 'text', 'test', 'نص داخلي', false),
  ('test_i18n.count', to_jsonb(3), 'integer', 'test', 'رقم', true);
insert into public.message_templates (key, channel, body_ar, description_ar, is_active)
values ('test_i18n.paid', 'sms', 'AgriZed: وصلتنا {amount} في العقد {contract_no}.', 'اختبار', true);

-- ---------------------------------------------------------------------------
-- 1 · The languages
-- ---------------------------------------------------------------------------
do $$
begin
  assert (select count(*) from public.locales) = 5, 'five languages';
  assert (select is_enabled and fallback_code is null from public.locales where code = 'ar'),
    'Arabic is always on and falls back to nothing';
  assert app.locale_chain('de') = array['de', 'en', 'fr'], format('de chain: %s', app.locale_chain('de'));
  assert app.locale_chain('fr') = array['fr'], format('fr chain: %s', app.locale_chain('fr'));
  assert app.locale_chain('ar') = '{}'::text[], 'Arabic has no chain: it is the source';
end $$;

select pg_temp.i18n_expect($$update public.locales set is_enabled = false where code = 'ar'$$, 'locales_source_is_arabic');
select pg_temp.i18n_expect($$update public.locales set fallback_code = 'en' where code = 'fr'$$, 'fallback_cycle');
select pg_temp.i18n_expect($$update public.locales set fallback_code = 'de' where code = 'de'$$, 'fallback_cycle');
select pg_temp.i18n_expect($$insert into public.locales (code, name_native, name_ar) values ('es', 'Español', 'الإسبانية')$$, 'locales_code_check');

-- ---------------------------------------------------------------------------
-- 2 · What is refused
-- ---------------------------------------------------------------------------
select pg_temp.i18n_expect($$insert into public.translations (entity, entity_key, field, locale, value)
  values ('setting', 'test_i18n.text', 'value', 'ar', '"x"')$$, 'translations_not_arabic');
select pg_temp.i18n_expect($$insert into public.translations (entity, entity_key, field, locale, value)
  values ('setting', 'test_i18n.text', 'value', 'fr', '"   "')$$, 'translations_not_blank');
select pg_temp.i18n_expect($$insert into public.translations (entity, entity_key, field, locale, value)
  values ('setting', 'test_i18n.text', 'label', 'fr', '"x"')$$, 'translations_known_field');
select pg_temp.i18n_expect($$insert into public.translations (entity, entity_key, field, locale, value)
  values ('setting', 'test_i18n.map', 'value', 'fr', '"a string for a map"')$$, 'translation_shape');
select pg_temp.i18n_expect($$insert into public.translations (entity, entity_key, field, locale, value)
  values ('setting', 'test_i18n.count', 'value', 'fr', '"trois"')$$, 'setting_not_translatable');
select pg_temp.i18n_expect($$insert into public.translations (entity, entity_key, field, locale, value)
  values ('setting', 'test_i18n.nope', 'value', 'fr', '"x"')$$, 'unknown_setting');
select pg_temp.i18n_expect($$insert into public.translations (entity, entity_key, field, locale, value)
  values ('option_item', gen_random_uuid()::text, 'label', 'fr', '["not", "a", "text"]')$$, 'translation_shape');

-- ---------------------------------------------------------------------------
-- 3 · The chain, nearest first; maps merge
-- ---------------------------------------------------------------------------
insert into public.translations (entity, entity_key, field, locale, value) values
  ('setting', 'test_i18n.text', 'value', 'en', '"English text"'),
  ('setting', 'test_i18n.map',  'value', 'fr', '{"a": "A-fr", "b": "B-fr"}'),
  ('setting', 'test_i18n.map',  'value', 'en', '{"a": "A-en"}');

do $$
begin
  assert app.tr_text('setting', 'test_i18n.text', 'value', 'de', 'نص عربي') = 'English text',
    'German falls back to English when it has no word of its own';
  assert app.tr_text('setting', 'test_i18n.text', 'value', 'fr', 'نص عربي') = 'نص عربي',
    'French falls back to Arabic, its own fallback — never to English';
  assert app.tr_text('setting', 'test_i18n.text', 'value', 'ar', 'نص عربي') = 'نص عربي', 'Arabic is the source';
  assert app.tr_text('setting', 'test_i18n.text', 'value', null, 'نص عربي') = 'نص عربي', 'no language is Arabic';

  -- en → fr → ar: «a» from English, «b» from French, «c» from Arabic. Nothing is ever blank.
  assert app.tr('setting', 'test_i18n.map', 'value', 'en', '{"a": "أ", "b": "ب", "c": "ج"}')
         = '{"a": "A-en", "b": "B-fr", "c": "ج"}'::jsonb,
    format('a map merges word by word: %s', app.tr('setting', 'test_i18n.map', 'value', 'en', '{"a": "أ", "b": "ب", "c": "ج"}'));
end $$;

-- A deleted source takes its translations with it.
do $$
begin
  insert into public.settings (key, value, value_type, group_key, label_ar, is_public)
  values ('test_i18n.gone', to_jsonb('يمشي'::text), 'text', 'test', 'يمشي', true);
  insert into public.translations (entity, entity_key, field, locale, value)
  values ('setting', 'test_i18n.gone', 'value', 'fr', '"part"');
  delete from public.settings where key = 'test_i18n.gone';
  assert not exists (select 1 from public.translations where entity_key = 'test_i18n.gone'),
    'deleting a setting deletes its translations';
end $$;

-- ---------------------------------------------------------------------------
-- 4 · Display translation is opt-in per call
-- ---------------------------------------------------------------------------
select set_config('request.headers', '{}', true);
do $$
begin
  assert app.setting_text('test_i18n.text', 'x') = 'نص عربي', 'no header: Arabic, as before 0109';
end $$;

select set_config('request.headers', '{"x-agrized-locale": "de"}', true);
do $$
begin
  -- The visitor's language alone does NOT translate: intake RPCs snapshot labels, and they read with it set.
  assert app.setting_text('test_i18n.text', 'x') = 'نص عربي', 'x-agrized-locale alone never translates a setting';
end $$;

select set_config('request.headers', '{"x-agrized-display-locale": "de"}', true);
do $$
begin
  assert app.setting_text('test_i18n.text', 'x') = 'English text', 'display header: German, through English';
  assert app.setting('test_i18n.map') = '{"a": "A-en", "b": "B-fr", "c": "ج"}'::jsonb, 'display header: a merged map';
  assert app.setting_int('test_i18n.count', 0) = 3, 'numbers are never translated';
end $$;

select set_config('request.headers', '{"x-agrized-display-locale": "xx"}', true);
do $$
begin
  assert app.setting_text('test_i18n.text', 'x') = 'نص عربي', 'an unknown language is Arabic';
end $$;
select set_config('request.headers', '{}', true);

-- ---------------------------------------------------------------------------
-- 5 · The client's language
-- ---------------------------------------------------------------------------
do $$
declare
  v_phone text;
  v_phones text[] := '{}';
  i integer;
begin
  for i in 1..3 loop
    loop
      v_phone := '+2169' || lpad((floor(random() * 10000000))::text, 7, '0');
      exit when not exists (select 1 from public.persons p where p.phone_e164 = v_phone) and not (v_phone = any (v_phones));
    end loop;
    v_phones := v_phones || v_phone;
    perform set_config('test.i18n_phone_' || i, v_phone, true);
  end loop;
end $$;

select set_config('request.headers', '{"x-agrized-locale": "it"}', true);
insert into public.persons (full_name, phone_e164, status_id)
values ('Cliente Italiano', current_setting('test.i18n_phone_1'), (select id from public.lead_statuses order by sort_order limit 1));
select set_config('request.headers', '{}', true);
insert into public.persons (full_name, phone_e164, status_id)
values ('حريف عربي', current_setting('test.i18n_phone_2'), (select id from public.lead_statuses order by sort_order limit 1));

do $$
begin
  assert (select preferred_locale from public.persons where phone_e164 = current_setting('test.i18n_phone_1')) = 'it',
    'a public request records the page''s language on the person it creates';
  assert (select preferred_locale from public.persons where phone_e164 = current_setting('test.i18n_phone_2')) is null,
    'no header, no language: null is Arabic';

  -- A staff write (no header) leaves the client's language alone.
  update public.persons set full_name = 'Cliente Italiano Due' where phone_e164 = current_setting('test.i18n_phone_1');
  assert (select preferred_locale from public.persons where phone_e164 = current_setting('test.i18n_phone_1')) = 'it',
    'a write without the header never changes the language';
end $$;

-- The same person returns from the French site: the language follows.
select set_config('request.headers', '{"x-agrized-locale": "fr"}', true);
update public.persons set full_name = 'Client Français' where phone_e164 = current_setting('test.i18n_phone_1');
-- But an explicit value in the same statement wins over the header.
update public.persons set preferred_locale = 'en' where phone_e164 = current_setting('test.i18n_phone_2');
select set_config('request.headers', '{}', true);
do $$
begin
  assert (select preferred_locale from public.persons where phone_e164 = current_setting('test.i18n_phone_1')) = 'fr',
    'a later public request in another language moves the preference';
  assert (select preferred_locale from public.persons where phone_e164 = current_setting('test.i18n_phone_2')) = 'en',
    'an explicit language is never overwritten by the header';
end $$;

-- ---------------------------------------------------------------------------
-- 6 · The message, in the recipient's language
-- ---------------------------------------------------------------------------
insert into public.translations (entity, entity_key, field, locale, value) values
  ('message_template', 'test_i18n.paid', 'body', 'fr', '"AgriZed: nous avons recu {amount} pour le contrat {contract_no}."'),
  ('setting', 'sms.currency_unit', 'value', 'fr', '"DT"')
on conflict (entity, entity_key, field, locale) do update set value = excluded.value;
-- The unit is pinned for every language this section reads, whatever drafts 0112 left for English.
delete from public.translations where entity = 'setting' and entity_key = 'sms.currency_unit' and locale in ('en', 'de', 'it');

do $$
declare
  v_row public.notification_outbox;
begin
  -- Recipient 1 prefers French; recipient 2 prefers English, which falls back to French.
  perform app.enqueue_message('test_i18n.paid', current_setting('test.i18n_phone_1'),
                              jsonb_build_object('amount', app.money_ar(12500000), 'contract_no', 'AGZ-CTR-1'),
                              'contracts', gen_random_uuid());
  select * into v_row from public.notification_outbox
   where to_phone_e164 = current_setting('test.i18n_phone_1') and template_key = 'test_i18n.paid';
  assert v_row.locale = 'fr', format('the row says which language: %s', v_row.locale);
  assert v_row.body = 'AgriZed: nous avons recu 12 500 DT pour le contrat AGZ-CTR-1.',
    format('French body with the unit rewritten: «%s»', v_row.body);

  perform app.enqueue_message('test_i18n.paid', current_setting('test.i18n_phone_2'),
                              jsonb_build_object('amount', app.money_ar(500), 'contract_no', 'AGZ-CTR-2'),
                              'contracts', gen_random_uuid());
  select * into v_row from public.notification_outbox
   where to_phone_e164 = current_setting('test.i18n_phone_2') and template_key = 'test_i18n.paid';
  assert v_row.locale = 'en' and v_row.body like 'AgriZed: nous avons recu 0.500 DT%',
    format('English falls back to the French body: %s «%s»', v_row.locale, v_row.body);

  -- A phone nobody holds, from no page: Arabic, as before.
  perform app.enqueue_message('test_i18n.paid', current_setting('test.i18n_phone_3'),
                              jsonb_build_object('amount', app.money_ar(1000), 'contract_no', 'AGZ-CTR-3'),
                              'contracts', gen_random_uuid());
  select * into v_row from public.notification_outbox
   where to_phone_e164 = current_setting('test.i18n_phone_3') and template_key = 'test_i18n.paid';
  assert v_row.locale = 'ar' and v_row.body = 'AgriZed: وصلتنا 1 د في العقد AGZ-CTR-3.',
    format('Arabic stays Arabic, unit and all: %s «%s»', v_row.locale, v_row.body);
end $$;

-- The sign-in code reads its body through app.setting_text: with the display header, the page's language.
insert into public.translations (entity, entity_key, field, locale, value)
values ('setting', 'auth.client_login_sms', 'value', 'it',
        '"AgriZed: il tuo codice {code}. Valido {minutes} min. Non darlo a nessuno."')
on conflict (entity, entity_key, field, locale) do update set value = excluded.value;
update public.settings set value = to_jsonb(0) where key = 'auth.client_code_cooldown_seconds';
update public.settings set value = to_jsonb(50) where key = 'auth.client_code_max_per_hour';
update public.settings set value = to_jsonb(300) where key = 'auth.client_code_ttl_seconds';

select set_config('request.headers', '{"x-agrized-display-locale": "it", "x-agrized-locale": "it"}', true);
select public.request_client_login_code(current_setting('test.i18n_phone_2'), 'login');
select set_config('request.headers', '{}', true);
do $$
declare
  v_row public.notification_outbox;
begin
  select * into v_row from public.notification_outbox
   where to_phone_e164 = current_setting('test.i18n_phone_2') and related_entity = 'client_login';
  assert v_row.body like 'AgriZed: il tuo codice ______. Valido _ min. Non darlo a nessuno.',
    format('the sign-in code speaks the page''s language: «%s»', v_row.body);
  assert v_row.locale = 'it', format('and the row says so: %s', v_row.locale);
end $$;

-- ---------------------------------------------------------------------------
-- 7 · Who reads what, who writes
-- ---------------------------------------------------------------------------
insert into public.translations (entity, entity_key, field, locale, value) values
  ('setting', 'test_i18n.secret', 'value', 'fr', '"secret"');

select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
begin
  assert exists (select 1 from public.translations where entity_key = 'test_i18n.text'), 'anon reads a public setting''s translation';
  assert not exists (select 1 from public.translations where entity_key = 'test_i18n.secret'), 'anon never reads an internal setting''s';
  assert not exists (select 1 from public.translations where entity = 'message_template'), 'anon never reads a message template''s';
  assert (select count(*) from public.locales) = 5, 'anon reads the languages';
end $$;
select pg_temp.i18n_expect($$insert into public.translations (entity, entity_key, field, locale, value)
  values ('setting', 'test_i18n.text', 'value', 'it', '"x"')$$, 'permission denied');
select pg_temp.i18n_expect($$select public.set_my_locale('fr')$$, 'permission denied');
select pg_temp.i18n_expect($$select public.staff_set_person_locale(gen_random_uuid(), 'fr')$$, 'permission denied');
reset role;

-- A signed-in user who is not an admin cannot write a translation; an admin can.
do $$
declare
  v_admin uuid := gen_random_uuid();
  v_user  uuid := gen_random_uuid();
begin
  insert into auth.users (id, aud, role, email) values
    (v_admin, 'authenticated', 'authenticated', 'i18n-admin-' || v_admin || '@test.local'),
    (v_user,  'authenticated', 'authenticated', 'i18n-user-'  || v_user  || '@test.local');
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');
  perform set_config('test.i18n_admin', v_admin::text, true);
  perform set_config('test.i18n_user', v_user::text, true);
  update public.persons set profile_id = v_user where phone_e164 = current_setting('test.i18n_phone_2');
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.i18n_user'), 'role', 'authenticated')::text, true);
set local role authenticated;
select pg_temp.i18n_expect($$insert into public.translations (entity, entity_key, field, locale, value)
  values ('setting', 'test_i18n.text', 'value', 'it', '"x"')$$, 'row-level security');
select pg_temp.i18n_expect($$select public.staff_set_person_locale(gen_random_uuid(), 'fr')$$, 'forbidden');
do $$
begin
  assert (public.set_my_locale('de') ->> 'ok')::boolean, 'a signed-in client sets their own language';
  assert (public.set_my_locale('xx') ->> 'reason') = 'unknown_locale', 'and only to a language that exists';
end $$;
reset role;
do $$
begin
  assert (select preferred_locale from public.persons where phone_e164 = current_setting('test.i18n_phone_2')) = 'de',
    'set_my_locale wrote the client''s own file';
end $$;

select set_config('request.jwt.claims', json_build_object('sub', current_setting('test.i18n_admin'), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into public.translations (entity, entity_key, field, locale, value)
values ('setting', 'test_i18n.text', 'value', 'it', '"Testo italiano"');
do $$
begin
  assert (select updated_by is null from public.translations where entity_key = 'test_i18n.text' and locale = 'it'),
    'insert does not stamp; the stamp is for updates';
  update public.translations set value = '"Testo italiano 2"' where entity_key = 'test_i18n.text' and locale = 'it';
  assert (select updated_by = current_setting('test.i18n_admin')::uuid from public.translations
          where entity_key = 'test_i18n.text' and locale = 'it'), 'an update records who';
  assert (select count(*) from public.translations where entity = 'message_template') >= 1, 'staff read template translations';
end $$;
reset role;
select set_config('request.jwt.claims', '', true);

-- ---------------------------------------------------------------------------
-- 8 · One SMS, in every language
-- ---------------------------------------------------------------------------
do $$
begin
  assert app.sms_segments(repeat('a', 160)) = 1, 'GSM-7: 160 in one';
  assert app.sms_segments(repeat('a', 161)) = 2, 'GSM-7: 161 is two';
  assert app.sms_segments(repeat('a', 79) || '€') = 1 and app.sms_segments(repeat('a', 159) || '€') = 2,
    'an extension character costs two';
  assert app.sms_segments(repeat('a', 69) || 'ê') = 1, 'one ê makes it UCS-2: 70 in one';
  assert app.sms_segments(repeat('a', 70) || 'ê') = 2, 'and 71 is two';
  assert app.sms_segments(repeat('ب', 70)) = 1 and app.sms_segments(repeat('ب', 71)) = 2, 'Arabic is UCS-2';
  assert app.sms_segments('Prénom: Zoé, à côté') = 1, 'é and à are GSM-7; ô is not, so 19 UCS-2 characters: one';
end $$;

do $$
declare
  -- 049's worst case, with an Arabic offer and meeting point: a French SMS that names one of those is UCS-2.
  v_worst jsonb := jsonb_build_object(
    'name', 'Abdelhafidh soltani', 'request_no', 'AGZ-2026-000041', 'reference_no', 'AGZ-2026-000041',
    'contract_no', 'AGZ-CTR-2026-0041', 'payment_no', 'AGZ-PAY-2026-0041', 'visit_no', 'AGZ-VIS-2026-00001',
    'offer', 'ضيعة الدهماني (تجريبي)', 'meeting_point', 'مدخل الضيعة الرئيسي', 'slot', '13:00-17:00',
    'date', '30/09', 'time', '13:00', 'place', 'مدخل الضيعة الرئيسي', 'due_on', '30/09/2026',
    'signed_on', '2026-09-30', 'amount', '12 500 TND', 'trees', '1200', 'seq', '3', 'count', '12', 'missed', '2',
    'code', '000000', 'minutes', '10');
  r record;
  v_body text;
begin
  for r in
    select t.entity, t.entity_key, t.locale, t.value #>> '{}' as body
    from public.translations t
    where (t.entity = 'message_template'
           and exists (select 1 from public.message_templates m where m.key = t.entity_key and m.channel = 'sms' and m.is_active))
       or (t.entity = 'setting' and t.entity_key in ('auth.client_login_sms', 'auth.client_reset_sms', 'auth.client_phone_change_sms'))
  loop
    v_body := app.render_template(r.body, v_worst);
    assert app.sms_segments(v_body) = 1,
      format('%s (%s) costs %s SMS at its worst case: «%s»', r.entity_key, r.locale, app.sms_segments(v_body), v_body);
    assert v_body !~ '\{[a-z_]+\}', format('%s (%s) leaves a placeholder unfilled: «%s»', r.entity_key, r.locale, v_body);
  end loop;
end $$;
