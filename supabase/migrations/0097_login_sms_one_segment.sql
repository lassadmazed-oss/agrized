-- 0097 · The login code fits in ONE SMS, with room to spare.
--
-- 0096 seeded `auth.client_login_sms` as:
--
--   «رمز الدخول متاعك في AgriZed: {code}. صالح {minutes} دقايق. ما تعطيه لحتّى حد.»
--
-- which renders to SIXTY-NINE characters at today's five-minute TTL. An Arabic SMS is UCS-2 and holds
-- seventy, so it fits — by one character. That is not fitting, it is luck, and three things can spend it:
--
--   · `auth.client_code_ttl_seconds` is a setting. At 120 minutes {minutes} is three characters instead of
--     one and the message renders to SEVENTY-ONE — two segments, charged twice, chiming twice, on every
--     single login. Nobody editing a TTL would expect to change the phone bill.
--   · «لحتّى» carries a shadda (U+0651). It is a separate code point and costs one of the seventy while
--     being invisible in every editor the owner would use to check.
--   · The text itself is a setting he may reword at any time, with no way to see the ceiling he is near.
--
-- 0079 already made this rule for the rest of the platform and supabase/tests/049_sms_one_segment.sql
-- enforces it — but that test loops over public.message_templates, and this template lives in
-- public.settings, so it was never covered. supabase/tests/063_client_login.sql now asserts it against the
-- worst case, which is where the guarantee belongs: beside the thing it guards.
--
-- THE NEW WORDING SAYS THE SAME THREE THINGS — who it is from, the code, how long it lasts, and not to pass
-- it on — in fifty-six characters at the worst TTL. Fourteen to spare.
--
-- UPDATE AND NOT INSERT … ON CONFLICT DO NOTHING: the row already exists, seeded by 0096, so an insert
-- would silently do nothing and leave the sixty-nine-character text in place on every database that has
-- already run it. The guard below refuses rather than pretending, if the row is ever missing.

do $guard$
declare
  v_rendered text;
begin
  if not exists (select 1 from public.settings where key = 'auth.client_login_sms') then
    raise exception
      'auth.client_login_sms is missing. It is seeded by 0096_client_login.sql; apply that first.';
  end if;

  update public.settings
     set value = to_jsonb('AgriZed: رمز دخولك {code}. صالح {minutes} دقايق. ما تعطيه لحد.'::text)
   where key = 'auth.client_login_sms';

  -- Measured here, once, against the worst case this template can be asked to render: a six digit code and
  -- a three digit number of minutes. If a future edit to this file breaks it, it breaks HERE and not on a
  -- client's handset.
  v_rendered := replace(replace(app.setting_text('auth.client_login_sms', ''), '{code}', '516548'),
                        '{minutes}', '120');
  if char_length(v_rendered) > 70 then
    raise exception
      'the login SMS renders to % characters; an Arabic SMS holds 70 and this would be sent as two: «%»',
      char_length(v_rendered), v_rendered;
  end if;
end $guard$;
