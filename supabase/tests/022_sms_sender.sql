-- Test for the pending SMS sender settings.

do $$
begin
  assert exists (
    select 1 from public.settings s
    where s.key = 'sms.sender_id' and s.value_type = 'text' and s.group_key = 'sms' and not s.is_public
  ), 'sms.sender_id is an internal text setting in the sms group';

  assert (select s.value #>> '{}' from public.settings s where s.key = 'sms.sender_id') = 'AGRIZED',
    'the sender is AGRIZED';

  -- What an operator accepts as a sender: 2..11 latin capitals or digits, no space.
  assert (select s.value #>> '{}' from public.settings s where s.key = 'sms.sender_id') ~ '^[A-Z0-9]{2,11}$',
    'the sender id is a shape the operator can register';

  assert exists (
    select 1 from public.settings s
    where s.key = 'sms.provider' and s.value_type = 'text' and s.group_key = 'sms' and not s.is_public
  ), 'sms.provider is an internal text setting in the sms group';
end $$;

-- The sender identity is ours, not part of the public copy a visitor can read.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
begin
  assert (select count(*) from public.settings where key like 'sms.%') = 0,
    'visitors read no sms setting';
end $$;

reset role;
