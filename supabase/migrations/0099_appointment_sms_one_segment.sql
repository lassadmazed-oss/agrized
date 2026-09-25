-- 0099 · The contract-appointment SMS fits in one message.
--
-- 0091 (drafted as bb_72) added `legal.appointment_set`:
--
--   «أهلا {name}، موعد إمضاء العقد يوم {date} على {time} في {place}. AgriZed»
--
-- Rendered with the values its own sender passes — public.staff_close_appointment, which fills {date} with
-- to_char(day, 'YYYY-MM-DD') — that is NINETY-NINE characters. An Arabic SMS is UCS-2 and holds seventy, so
-- every appointment notice was two messages: charged twice, and arriving as two chimes with the place name
-- split across them.
--
-- HOW IT GOT PAST 0079's RULE. supabase/tests/049_sms_one_segment.sql enforces the one-segment limit across
-- public.message_templates and would have caught this on the first run — but this template arrived with a
-- migration applied on 2026-09-25, and the suite was not re-run afterwards; only the six tests belonging to
-- the new migrations were. Three tests were red at that moment and this was the one carrying a real cost.
-- That is the lesson, and it is worth more than the fix: after applying anything, run the WHOLE suite.
--
-- THE FIX IS THE TEMPLATE, NOT THE SENDER. {name} goes first and saves the most: nineteen characters at the
-- worst observed name, spent greeting somebody on their own handset, which already knows who they are. What
-- is left says the four things that matter — who it is from, what the appointment is, when, and where —
-- and renders to sixty-one characters even with the ten-character date the sender still passes. Nine to
-- spare, without touching public.staff_close_appointment.
--
-- The date itself is still 'YYYY-MM-DD' where 0079 taught 'DD/MM' for visits («the year costs 5 of the 70
-- and a visit is days away»). A contract appointment can be weeks out, so the year is defensible; it is
-- left alone deliberately rather than overlooked, and the nine characters of headroom are what pay for it.

do $guard$
declare
  v_body text;
  v_out  text;
begin
  if not exists (select 1 from public.message_templates where key = 'legal.appointment_set') then
    raise exception
      'legal.appointment_set is missing. It is seeded by 0091_partners_closing.sql; apply that first.';
  end if;

  update public.message_templates
     set body_ar = 'AgriZed: إمضاء العقد {date} {time} في {place}.'
   where key = 'legal.appointment_set';

  -- Proven here against the worst case 049 measures with, plus the two keys this template needs and that
  -- fixture did not carry, and against the LONG date its sender really passes.
  select body_ar into v_body from public.message_templates where key = 'legal.appointment_set';
  v_out := replace(replace(replace(v_body, '{date}', '2026-09-30'), '{time}', '13:00'),
                   '{place}', 'مدخل الضيعة الرئيسي');

  if char_length(v_out) > 70 then
    raise exception
      'legal.appointment_set renders to % characters; an Arabic SMS holds 70, so this would be sent as two: «%»',
      char_length(v_out), v_out;
  end if;
  if v_out ~ '\{[a-z_]+\}' then
    raise exception 'legal.appointment_set leaves a placeholder unfilled: «%»', v_out;
  end if;

  raise notice 'legal.appointment_set now renders to % characters', char_length(v_out);
end $guard$;
