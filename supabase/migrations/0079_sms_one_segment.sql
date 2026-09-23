-- One message, one SMS (owner, 2026-09-23: «the SMS sound, I get it twice»).
--
-- WHY THE PHONE CHIMED TWICE. An SMS carrying Arabic cannot use the 7-bit GSM alphabet, so it is encoded
-- UCS-2, and a UCS-2 message holds 70 characters — not 160. Past 70 the network splits it into concatenated
-- parts of 67 characters each. Many handsets alert once per part, and every operator charges per part.
--
-- Measured against the live templates on 2026-09-23, every single SMS template was over the line:
--
--     lead.confirmation        114 chars → 2 parts
--     land_offer.confirmation  115 chars → 2 parts
--     visit.confirmed          151 chars → 3 parts
--
-- So a lead confirmation was two SMS and two chimes and twice the credit, and a visit confirmation three.
-- Nothing was sent twice: the queue is correct, and no (template, related_id) pair is ever enqueued more
-- than once. The message was simply too long to travel as one.
--
-- WHAT WENT. The sentence «التسجيل مجاني ولا يمثل التزاماً بالشراء» is not dropped from the product — it is
-- `site.free_interest_notice` / `start.secure_note` / `register.success_note` and is on the screen the
-- person is looking at when they submit. It was being paid for a second time, in a second SMS, to repeat
-- something they had just read. The SMS is a receipt: who it is from, which reference, what happens next.
--
-- The greeting went for the same reason. «شكراً {name}» costs up to 20 characters to tell someone their own
-- name, on a message whose whole budget is 70.
--
-- HEADROOM. Each body below was measured with the longest values in the database (request_no 15 chars,
-- contract_no 17, names 19, meeting points 19) and still fits, with 8–24 characters to spare. 048 in
-- supabase/tests re-measures on every run, so a future edit that overflows fails the suite instead of
-- quietly costing double.
--
-- These are rows: rewrite any of them in the Back Office under «قوالب الرسائل». Keep them under 70
-- characters once the variables are filled in, or the message becomes two again.

update public.message_templates set body_ar = 'AgriZed: مطلبك {request_no} تسجّل. نتصلو بيك قريباً.'
 where key = 'lead.confirmation';

update public.message_templates set body_ar = 'AgriZed: عرضك {reference_no} وصلنا. ندرسوه ونتصلو بيك.'
 where key = 'land_offer.confirmation';

update public.message_templates set body_ar = 'AgriZed: عقدك {contract_no} حاضر للإمضاء. نتصلو بيك.'
 where key = 'contract.ready';

update public.message_templates set body_ar = 'AgriZed: عقدك {contract_no} تمضى على {trees} زيتونة. مبروك!'
 where key = 'contract.signed';

update public.message_templates set body_ar = 'AgriZed: قسطك {seq}/{count} بـ{amount} يحلّ {due_on}.'
 where key = 'installment.due_soon';

update public.message_templates set body_ar = 'AgriZed: {missed} قسط فات في العقد {contract_no}. تعيّطلنا.'
 where key = 'installment.late';

update public.message_templates set body_ar = 'AgriZed: وصلتنا {amount} في العقد {contract_no}. شكراً.'
 where key = 'payment.received';

update public.message_templates set body_ar = 'AgriZed: زيارتك {date} {slot}. اللقاء {meeting_point}.'
 where key = 'visit.confirmed';

update public.message_templates set body_ar = 'AgriZed: تذكير {date} {slot}. اللقاء {meeting_point}.'
 where key = 'visit.reminder';

-- ---------------------------------------------------------------------------
-- The two visit messages carry three values, so what fills them has to be short too.
-- ---------------------------------------------------------------------------
--
-- 0064 passed «DD/MM/YYYY» (10 characters) and `slot_label_ar`, the prose label — «بعد الظهر (13:00 – 17:00)»,
-- 25 characters that say the time twice. Between them they spent half the budget of the message.
--
-- `visits` already stores the slot as two `time` columns, so the message can carry «13:00-17:00» in 11
-- characters and «30/09» in 5: 19 characters back, which is what lets the meeting point stay in. The year
-- is not missed on a visit that is days away, and `slot_label_ar` is still the fallback when a visit was
-- booked without times on it.
--
-- Every variable 0064 passed is still passed, including the ones the shortened bodies no longer print, so
-- «{offer}» or «{name}» can be put back from the Back Office without touching this function.

create or replace function app.visit_notify(p_visit uuid, p_template text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.visits;
  p public.persons;
  j public.projects;
begin
  select * into v from public.visits x where x.id = p_visit;
  if not found then return; end if;
  select * into p from public.persons x where x.id = v.person_id;
  select * into j from public.projects x where x.id = v.project_id;

  perform app.enqueue_message(
    p_template, p.phone_e164,
    jsonb_build_object(
      'name', split_part(coalesce(p.full_name, ''), ' ', 1),
      'visit_no', v.visit_no,
      'date', to_char(v.visit_date, 'DD/MM'),
      'slot', case
                when v.slot_from is not null and v.slot_to is not null
                  then to_char(v.slot_from, 'HH24:MI') || '-' || to_char(v.slot_to, 'HH24:MI')
                else coalesce(v.slot_label_ar, '')
              end,
      'offer', coalesce(j.name, ''),
      'meeting_point', coalesce(v.meeting_point, '')),
    'visits', v.id);
end $$;
revoke execute on function app.visit_notify(uuid, text) from public, anon, authenticated;
