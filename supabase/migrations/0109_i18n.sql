-- 0109 · تعدّد اللغات — FIVE LANGUAGES, ONE SOURCE OF TRUTH, AND THE CLIENT'S OWN LANGUAGE ON EVERY MESSAGE.
--
-- Its test is supabase/tests/067_i18n.sql, which can be re-run at any time against the live schema (it always
-- rolls back):
--   node --env-file=.env scripts/db-dry-run.mjs supabase/migrations/0109_i18n.sql supabase/tests/067_i18n.sql
--
-- THE DECISION THIS IMPLEMENTS (owner, 2026-10-03). AgriZed speaks العربية, Français, Deutsch, Italiano and
-- English — not as five frozen copies of the pages, but as one system: every text the visitor reads lives in
-- the database, the Back Office has a field per language for every one of them, a missing translation falls
-- back to a language the owner chooses, the URL says the language (/fr/ /de/ /it/ /en/, Arabic at the root),
-- and the client's language is recorded on their file so every SMS after that goes out in it. The owner
-- supplies the words; the developer is not needed to change one.
--
-- WHAT IT ADDS
--   · public.locales                      the five languages: on/off, their own name, their fallback, order
--   · public.translations                 one row per (thing, field, language) — every language but Arabic
--   · persons.preferred_locale            the client's language; null = Arabic
--   · notification_outbox.locale          which language a queued message was written in
--   · app.request_locale()                the language of the page a public request came from (header)
--   · app.display_locale()                the language a display RPC should answer in (header, opt-in)
--   · app.locale_chain(text)              fr → [fr, ar]; de → [de, en, fr, ar] — the owner's fallbacks
--   · app.tr(…) / app.tr_text(…)          the first translation along the chain, else the Arabic source
--   · app.setting(…), app.setting_text(…) the SAME functions, now answering in app.display_locale()
--   · app.enqueue_message(…)              the SAME function, now in the recipient's language
--   · app.sms_segments(text)              how many SMS a body costs: GSM-7 160 / UCS-2 70
--   · public.set_my_locale(text)          a signed-in client records their language
--   · public.staff_set_person_locale(…)   the Back Office records it for them
--
-- ---------------------------------------------------------------------------------------------------------
-- THE RULES
-- ---------------------------------------------------------------------------------------------------------
-- 1 · ARABIC IS THE SOURCE AND IT LIVES WHERE IT ALWAYS LIVED. settings.value, option_items.label_ar,
--     projects.description_ar, message_templates.body_ar… are untouched and stay the Arabic text. A
--     translation row exists only for the four other languages (`check (locale <> 'ar')`), so there is never a
--     second Arabic copy to fall out of step with the first, and every reader that knows nothing about
--     languages keeps working unchanged.
-- 2 · A MISSING TRANSLATION IS NOT AN EMPTY STRING. A blank translation is refused by a check; clearing a
--     field in the Back Office DELETES the row, and the reader walks on to the next language of the chain.
-- 3 · EVERY CHAIN ENDS IN ARABIC. locales.fallback_code says where a language goes when a text is missing in
--     it; null means Arabic. A cycle is refused by a trigger, so the walk always terminates — and since the
--     Arabic source is never missing, it always terminates on a text.
-- 4 · A LABEL MAP IS MERGED, NOT REPLACED. A json setting that maps codes to words (contracts.status_labels…)
--     is translated word by word: a translation that names three of five codes still leaves the other two in
--     the next language of the chain, never blank. A list (site.faq) is a whole and is replaced whole.
-- 5 · DISPLAY TRANSLATION IS OPT-IN PER CALL. app.setting_text() answers in another language only when the
--     caller sent `x-agrized-display-locale` — the site's display reads do (the client file, the tracking
--     page, the sign-in SMS). The intake RPCs do not, because they SNAPSHOT labels into *_label_ar columns the
--     staff read, and a French visitor must not leave French words in the CRM. The two headers are separate
--     for exactly that reason: `x-agrized-locale` only says which language the visitor is using.
-- 6 · THE CLIENT'S LANGUAGE IS WRITTEN BY WHAT THEY DO, NOT GUESSED. A public form or a sign-in carries the
--     page's language; a trigger on persons records it. Staff writes never carry the header, so a commercial
--     editing a file in Arabic never changes the client's language. The client can set it from the language
--     selector, and staff can set it on the file — both explicit.
-- 7 · A MESSAGE GOES OUT IN THE RECIPIENT'S LANGUAGE, NOT THE SENDER'S. enqueue_message looks the language up
--     from the phone it is sending to; the staff member who signed the contract is irrelevant.
-- 8 · ONE SMS PER MESSAGE STILL HOLDS (0079), in every language. A Latin text that stays inside GSM-7 holds
--     160 characters; one accent outside it (ê, ç, â…) or one Arabic variable makes the whole message UCS-2
--     and 70 characters. app.sms_segments() is that rule, and the test renders every translated template at
--     its worst case through it.
--
-- THE SET OF LANGUAGES IS FIXED HERE AND IN src/lib/i18n/locales.ts TOGETHER. A language is a route segment, a
-- text direction and a number format before it is a row, so adding a sixth is a code change; which of the
-- five are switched on, what they are called, their order and their fallbacks are the owner's, in the table.

-- ---------------------------------------------------------------------------------------------------------
-- 1 · The languages
-- ---------------------------------------------------------------------------------------------------------

create table public.locales (
  code           text primary key check (code in ('ar', 'fr', 'de', 'it', 'en')),
  name_native    text not null check (btrim(name_native) <> ''),
  name_ar        text not null check (btrim(name_ar) <> ''),
  is_enabled     boolean not null default false,
  fallback_code  text references public.locales (code),
  sort_order     integer not null default 0,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references public.profiles (id),
  -- Arabic is the source: always offered, and it falls back to nothing because nothing is missing in it.
  constraint locales_source_is_arabic check (code <> 'ar' or (is_enabled and fallback_code is null)),
  constraint locales_no_self_fallback check (fallback_code is distinct from code)
);

comment on table public.locales is
  'The languages of the site (0109). The set is fixed by the router; on/off, names, order and fallbacks are the owner''s.';

insert into public.locales (code, name_native, name_ar, is_enabled, fallback_code, sort_order) values
  ('ar', 'العربية',  'العربية',    true, null, 1),
  ('fr', 'Français', 'الفرنسية',   true, 'ar', 2),
  ('de', 'Deutsch',  'الألمانية',  true, 'en', 3),
  ('it', 'Italiano', 'الإيطالية',  true, 'en', 4),
  ('en', 'English',  'الإنجليزية', true, 'fr', 5);

-- Rule 3: every chain ends in Arabic. Walk the chain from the row being written; meeting it again is a cycle.
create or replace function app.locales_no_cycle() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_next text := new.fallback_code;
  v_steps integer := 0;
begin
  while v_next is not null loop
    if v_next = new.code then
      raise exception 'fallback_cycle' using errcode = 'P0001',
        hint = format('%s falls back, step by step, to itself. Point one of the languages in the chain to Arabic.', new.code);
    end if;
    v_steps := v_steps + 1;
    exit when v_steps > 10;
    select l.fallback_code into v_next from public.locales l where l.code = v_next;
  end loop;
  return new;
end $$;

create trigger locales_no_cycle before insert or update on public.locales
  for each row execute function app.locales_no_cycle();
create trigger locales_stamp before update on public.locales
  for each row execute function app.stamp_updated();
create trigger locales_audit after insert or update or delete on public.locales
  for each row execute function app.audit_row_change();

alter table public.locales enable row level security;
create policy locales_select on public.locales for select to anon, authenticated using (true);
revoke insert, delete on public.locales from anon, authenticated;
revoke update on public.locales from anon;
create policy locales_update on public.locales for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- ---------------------------------------------------------------------------------------------------------
-- 2 · The translations
-- ---------------------------------------------------------------------------------------------------------

create table public.translations (
  entity      text not null,
  entity_key  text not null check (btrim(entity_key) <> ''),
  field       text not null,
  locale      text not null references public.locales (code) on update cascade on delete cascade,
  value       jsonb not null,
  -- A first draft written for the owner to review (the developer's, or a machine's). Saving the field in the
  -- Back Office clears it. Drafts are shown on the site — they are better than another language — and the
  -- Back Office lists them so none is forgotten.
  is_draft    boolean not null default false,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id),
  primary key (entity, entity_key, field, locale),
  -- Rule 1: Arabic lives in the source row.
  constraint translations_not_arabic check (locale <> 'ar'),
  -- Rule 2: a blank is not a translation.
  constraint translations_not_blank check (
    jsonb_typeof(value) in ('array', 'object')
    or (jsonb_typeof(value) = 'string' and btrim(value #>> '{}') <> '')),
  -- What can be translated, field by field. A new translatable column is added here and in the Back Office
  -- in the same change.
  constraint translations_known_field check (
    case entity
      when 'setting'            then field = 'value'
      when 'option_item'        then field = 'label'
      when 'project'            then field in ('name', 'description', 'location_description', 'olive_variety',
                                               'water_note', 'access_note', 'reservation_conditions',
                                               'visit_meeting_point')
      when 'project_type'       then field in ('label', 'description', 'image_alt')
      when 'ownership_scenario' then field in ('label', 'description', 'image_alt')
      when 'governorate'        then field = 'name'
      when 'delegation'         then field = 'name'
      when 'message_template'   then field = 'body'
      when 'project_media'      then field in ('alt', 'caption')
      when 'site_media'         then field = 'alt'
      else false
    end)
);

comment on table public.translations is
  'Every non-Arabic text of the site (0109). Arabic stays in the source row; a missing row falls back along locales.fallback_code.';

create index translations_locale_idx on public.translations (locale, entity);
create index translations_draft_idx on public.translations (entity, locale) where is_draft;

-- A setting's translation must have its source's shape: a text for a text, the same json type for json.
create or replace function app.translations_check() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_setting public.settings;
begin
  if new.entity = 'setting' then
    select s.* into v_setting from public.settings s where s.key = new.entity_key;
    if v_setting.key is null then
      raise exception 'unknown_setting' using errcode = 'P0001', hint = format('No setting %s to translate.', new.entity_key);
    end if;
    if v_setting.value_type not in ('text', 'json') then
      raise exception 'setting_not_translatable' using errcode = 'P0001',
        hint = format('%s is a %s; only texts and json are translated.', new.entity_key, v_setting.value_type);
    end if;
    if jsonb_typeof(new.value) <> jsonb_typeof(v_setting.value) then
      raise exception 'translation_shape' using errcode = 'P0001',
        hint = format('%s is a %s in Arabic; its translation must be one too.', new.entity_key, jsonb_typeof(v_setting.value));
    end if;
  elsif jsonb_typeof(new.value) <> 'string' then
    raise exception 'translation_shape' using errcode = 'P0001', hint = 'Only settings translate to json; every other field is a text.';
  end if;
  return new;
end $$;

create trigger translations_check before insert or update on public.translations
  for each row execute function app.translations_check();
create trigger translations_stamp before update on public.translations
  for each row execute function app.stamp_updated();
create trigger translations_audit after insert or update or delete on public.translations
  for each row execute function app.audit_row_change();

-- A deleted source takes its translations with it.
create or replace function app.translations_drop_for() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.translations t
   where t.entity = tg_argv[0]
     and t.entity_key = (to_jsonb(old) ->> tg_argv[1]);
  return old;
end $$;

create trigger settings_drop_translations after delete on public.settings
  for each row execute function app.translations_drop_for('setting', 'key');
create trigger option_items_drop_translations after delete on public.option_items
  for each row execute function app.translations_drop_for('option_item', 'id');
create trigger projects_drop_translations after delete on public.projects
  for each row execute function app.translations_drop_for('project', 'id');
create trigger message_templates_drop_translations after delete on public.message_templates
  for each row execute function app.translations_drop_for('message_template', 'key');
create trigger project_types_drop_translations after delete on public.project_types
  for each row execute function app.translations_drop_for('project_type', 'id');
create trigger ownership_scenarios_drop_translations after delete on public.ownership_scenarios
  for each row execute function app.translations_drop_for('ownership_scenario', 'id');
create trigger project_media_drop_translations after delete on public.project_media
  for each row execute function app.translations_drop_for('project_media', 'id');
create trigger site_media_drop_translations after delete on public.site_media
  for each row execute function app.translations_drop_for('site_media', 'slot');

-- Who may read a translation: whoever may read its source. Settings follow is_public; a project follows the
-- same visibility as the offer page; a message template is staff business.
create or replace function app.translation_readable(p_entity text, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case p_entity
    when 'setting' then exists (select 1 from public.settings s
                                where s.key = p_key and (s.is_public or app.is_staff()))
    when 'message_template' then app.is_staff()
    when 'project' then app.is_staff()
                        or exists (select 1 from public.projects p
                                   where p.id::text = p_key and app.project_visible(p.status))
    when 'project_media' then app.is_staff()
                        or exists (select 1 from public.project_media m join public.projects p on p.id = m.project_id
                                   where m.id::text = p_key and app.project_visible(p.status))
    else true
  end
$$;
grant execute on function app.translation_readable(text, text) to anon, authenticated;

alter table public.translations enable row level security;
create policy translations_select on public.translations for select to anon, authenticated
  using (app.translation_readable(entity, entity_key));
revoke insert, update, delete on public.translations from anon;
create policy translations_insert on public.translations for insert to authenticated
  with check ((select app.is_admin()));
create policy translations_update on public.translations for update to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));
create policy translations_delete on public.translations for delete to authenticated
  using ((select app.is_admin()));

-- ---------------------------------------------------------------------------------------------------------
-- 3 · Which language a request speaks, and the chain behind it
-- ---------------------------------------------------------------------------------------------------------

-- The language of the page a public request came from. The proxy sets the header from the URL (and overwrites
-- whatever a visitor sent); the Server Actions forward it. Only a language that is switched on is believed.
create or replace function app.request_locale() returns text
language sql stable security definer set search_path = '' as $$
  select l.code from public.locales l
  where l.code = lower(btrim(app.request_header('x-agrized-locale'))) and l.is_enabled
$$;

-- Rule 5: the language a display read answers in. Separate from the visitor's language on purpose.
create or replace function app.display_locale() returns text
language sql stable security definer set search_path = '' as $$
  select l.code from public.locales l
  where l.code = lower(btrim(app.request_header('x-agrized-display-locale'))) and l.is_enabled and l.code <> 'ar'
$$;

-- fr → {fr}; de → {de, en, fr}. Arabic is never in the array: it is the source the caller already holds.
-- A switched-off language at the head is still walked: a client who chose German keeps German messages
-- while the owner hides German from the selector — switching a language off hides it, it does not unsay it.
create or replace function app.locale_chain(p_locale text) returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  v_chain text[] := '{}';
  v_next  text := p_locale;
begin
  while v_next is not null and v_next <> 'ar' and not (v_next = any (v_chain)) and cardinality(v_chain) < 5 loop
    exit when not exists (select 1 from public.locales l where l.code = v_next);
    v_chain := v_chain || v_next;
    select l.fallback_code into v_next from public.locales l where l.code = v_next;
  end loop;
  return v_chain;
end $$;

-- The first translation along the chain, else the Arabic source. Objects merge (rule 4): the base first,
-- then each language from the far end of the chain to the near one, so the nearest word wins per key.
create or replace function app.tr(p_entity text, p_key text, p_field text, p_locale text, p_base jsonb)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_chain  text[];
  v_value  jsonb;
  v_result jsonb := p_base;
  i        integer;
begin
  if p_locale is null or p_locale = 'ar' then
    return p_base;
  end if;
  v_chain := app.locale_chain(p_locale);
  if cardinality(v_chain) = 0 then
    return p_base;
  end if;

  if jsonb_typeof(p_base) = 'object' then
    for i in reverse cardinality(v_chain) .. 1 loop
      select t.value into v_value from public.translations t
       where t.entity = p_entity and t.entity_key = p_key and t.field = p_field and t.locale = v_chain[i];
      if v_value is not null and jsonb_typeof(v_value) = 'object' then
        v_result := coalesce(v_result, '{}'::jsonb) || v_value;
      end if;
      v_value := null;
    end loop;
    return v_result;
  end if;

  for i in 1 .. cardinality(v_chain) loop
    select t.value into v_value from public.translations t
     where t.entity = p_entity and t.entity_key = p_key and t.field = p_field and t.locale = v_chain[i];
    if v_value is not null then
      return v_value;
    end if;
  end loop;
  return p_base;
end $$;

create or replace function app.tr_text(p_entity text, p_key text, p_field text, p_locale text, p_base text)
returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(app.tr(p_entity, p_key, p_field, p_locale, to_jsonb(p_base)) #>> '{}', p_base)
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 4 · The setting readers, now in the display language (rule 5)
-- ---------------------------------------------------------------------------------------------------------
-- Same names, same arguments, same volatility and security as 0001's: 79 functions call them. With no
-- display header — every staff call, every intake call, every test — app.display_locale() is null and they
-- answer exactly as before.

create or replace function app.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case
    when app.display_locale() is null then s.value
    else app.tr('setting', s.key, 'value', app.display_locale(), s.value)
  end
  from public.settings s where s.key = p_key
$$;

create or replace function app.setting_text(p_key text, p_default text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select app.setting(p_key)) #>> '{}', p_default)
$$;

-- ---------------------------------------------------------------------------------------------------------
-- 5 · The client's language
-- ---------------------------------------------------------------------------------------------------------

alter table public.persons
  add column preferred_locale text references public.locales (code) on update cascade on delete set null;

comment on column public.persons.preferred_locale is
  'The language every message to this client is written in (0109). null = Arabic. Set by their own public requests, the language selector, or staff.';

-- Rule 6: a public request records the page's language on the person it creates or touches. The header is
-- only ever present on requests from the public site, so staff writes never change it — unless they set the
-- column explicitly, which then wins.
create or replace function app.persons_capture_locale() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_locale text := app.request_locale();
begin
  if v_locale is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.preferred_locale := coalesce(new.preferred_locale, v_locale);
  elsif new.preferred_locale is not distinct from old.preferred_locale then
    new.preferred_locale := v_locale;
  end if;
  return new;
end $$;

create trigger persons_capture_locale before insert or update on public.persons
  for each row execute function app.persons_capture_locale();

-- The language to write to a phone in: the person's own, else the page's (a stranger on the sign-in screen),
-- else Arabic.
create or replace function app.message_locale(p_phone text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select p.preferred_locale from public.persons p where p.phone_e164 = p_phone),
    app.request_locale(),
    'ar')
$$;

-- A signed-in client chooses their language (the selector calls this). Identity from the session only.
create or replace function public.set_my_locale(p_locale text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_person uuid;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if not exists (select 1 from public.locales l where l.code = p_locale and l.is_enabled) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_locale');
  end if;
  update public.persons p set preferred_locale = p_locale
   where p.profile_id = auth.uid() and p.archived_at is null
  returning p.id into v_person;
  return jsonb_build_object('ok', v_person is not null);
end $$;

revoke execute on function public.set_my_locale(text) from public, anon;
grant execute on function public.set_my_locale(text) to authenticated;

-- The Back Office records a client's language for them (a client who asked on the phone).
create or replace function public.staff_set_person_locale(p_person uuid, p_locale text) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not app.is_staff() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_locale is not null and not exists (select 1 from public.locales l where l.code = p_locale) then
    raise exception 'unknown_locale' using errcode = 'P0001', hint = 'Choose one of the languages in the list.';
  end if;
  update public.persons set preferred_locale = p_locale where id = p_person;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  return jsonb_build_object('ok', true, 'locale', coalesce(p_locale, 'ar'));
end $$;

revoke execute on function public.staff_set_person_locale(uuid, text) from public, anon;
grant execute on function public.staff_set_person_locale(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- 6 · Messages in the recipient's language (rule 7) and the one-SMS ruler (rule 8)
-- ---------------------------------------------------------------------------------------------------------

alter table public.notification_outbox add column locale text;
comment on column public.notification_outbox.locale is 'The language the body was written in (0109). null on rows queued before it.';

-- How many SMS a body costs. GSM-7 (the 3GPP 23.038 default alphabet) holds 160 per message, 153 per part of a
-- long one, and its extension characters cost two; a single character outside it makes the whole message
-- UCS-2: 70, then 67 per part. char_length() counts code points, which for everything this platform writes is
-- the UTF-16 unit count.
create or replace function app.sms_segments(p_body text) returns integer
language plpgsql immutable set search_path = '' as $$
declare
  v_basic text := '@£$¥èéùìòÇ' || chr(10) || 'Øø' || chr(13) || 'ÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&''()*+,-./0123456789:;<=>?'
                  || '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  v_ext   text := '^{}\[~]|€' || chr(12);
  v_units integer;
begin
  if p_body is null or p_body = '' then
    return 0;
  end if;
  if translate(p_body, v_basic || v_ext, '') = '' then
    v_units := char_length(p_body) + (char_length(p_body) - char_length(translate(p_body, v_ext, '')));
    return case when v_units <= 160 then 1 else ceil(v_units / 153.0)::integer end;
  end if;
  return case when char_length(p_body) <= 70 then 1 else ceil(char_length(p_body) / 67.0)::integer end;
end $$;

-- The same queue and the same rules as before; the body is now the recipient's language. Two variables are
-- written in Arabic by their callers and are rewritten here, so a French message does not carry an Arabic
-- unit: {amount} from app.money_ar (« د» → the translated sms.currency_unit), nothing else.
create or replace function app.enqueue_message(p_template text, p_to text, p_vars jsonb, p_entity text, p_entity_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_template public.message_templates;
  v_locale   text;
  v_vars     jsonb := coalesce(p_vars, '{}'::jsonb);
  v_unit     text;
begin
  select * into v_template from public.message_templates where key = p_template and is_active;
  if not found then
    return;
  end if;

  v_locale := app.message_locale(p_to);

  if v_locale <> 'ar' and v_vars ? 'amount' and (v_vars ->> 'amount') like '% د' then
    v_unit := app.tr_text('setting', 'sms.currency_unit', 'value', v_locale,
                          coalesce(app.setting_text('sms.currency_unit', 'د'), 'د'));
    v_vars := jsonb_set(v_vars, '{amount}',
                        to_jsonb(left(v_vars ->> 'amount', char_length(v_vars ->> 'amount') - 1) || v_unit));
  end if;

  insert into public.notification_outbox (channel, to_phone_e164, template_key, body, related_entity, related_id, locale)
  values (v_template.channel, p_to, p_template,
          app.render_template(app.tr_text('message_template', p_template, 'body', v_locale, v_template.body_ar), v_vars),
          p_entity, p_entity_id, v_locale);
end $$;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order)
values ('sms.currency_unit', to_jsonb('د'::text), 'text', 'sms', 'وحدة العملة في الرسائل',
        'تُكتب بعد كل مبلغ في الـSMS. ترجمتها (DT، TND…) هي اللي تخرج في رسالة حريف لغتو موش العربية.', false, 90)
on conflict (key) do nothing;

-- The sign-in messages. 0108's functions read their bodies through app.setting_text, so they already answer
-- in the display language the Server Action sends — the language of the page the code was asked from, which
-- is the one the person is reading at that moment. What they did not do is say which language they wrote:
-- the outbox row's locale is filled from the same header by this trigger, for every row queued without one.
-- Without the header the body was read in Arabic, so the stamp says Arabic — whatever the person prefers.
create or replace function app.outbox_stamp_locale() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.locale is null then
    new.locale := coalesce(app.display_locale(), 'ar');
  end if;
  return new;
end $$;

create trigger notification_outbox_stamp_locale before insert on public.notification_outbox
  for each row execute function app.outbox_stamp_locale();

-- ---------------------------------------------------------------------------------------------------------
-- 7 · Grants: the new app.* helpers are internal
-- ---------------------------------------------------------------------------------------------------------

revoke execute on function app.locales_no_cycle() from public, anon, authenticated;
revoke execute on function app.translations_check() from public, anon, authenticated;
revoke execute on function app.translations_drop_for() from public, anon, authenticated;
revoke execute on function app.persons_capture_locale() from public, anon, authenticated;
revoke execute on function app.outbox_stamp_locale() from public, anon, authenticated;
revoke execute on function app.message_locale(text) from public, anon, authenticated;
revoke execute on function app.tr(text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function app.tr_text(text, text, text, text, text) from public, anon, authenticated;
revoke execute on function app.locale_chain(text) from public, anon, authenticated;
-- request_locale and display_locale are read inside RLS-free definer functions only; sms_segments is pure.
revoke execute on function app.request_locale() from public, anon, authenticated;
revoke execute on function app.display_locale() from public, anon, authenticated;
