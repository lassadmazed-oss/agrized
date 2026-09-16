-- Welcome and encouragement on the confirmation screen (owner, 2026-09-16). Migration 0038_success_welcome.sql.

do $$
declare
  v_key text;
begin
  foreach v_key in array array['register.success_welcome_title', 'register.success_welcome_text',
                               'register.success_motivation', 'register.success_progress_label'] loop
    assert exists (
      select 1 from public.settings s
      where s.key = v_key and s.is_public and s.value_type = 'text' and s.group_key = 'lead'
        and length(btrim(s.value #>> '{}')) > 0
    ), v_key || ' is seeded, public and not empty';
  end loop;

  -- PRN-01: encouragement, never a promise.
  assert not exists (
    select 1 from public.settings s
    where s.key like 'register.success_%'
      and (s.value #>> '{}') ~ '(ربح|أرباح|مردود|مضمون|عائد|استرجاع)'
  ), 'the confirmation copy promises nothing';
end $$;

-- A visitor reads the copy through the public policy: the screen renders for someone who just registered.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  assert (select count(*) from public.settings where key like 'register.success_%') >= 5,
    'visitors can read the confirmation copy (welcome, text, motivation, counter button, free-registration note)';
end $$;

reset role;
