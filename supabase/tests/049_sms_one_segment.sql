-- Every SMS the platform sends must fit in ONE message (0079).
--
-- An Arabic SMS is encoded UCS-2 and holds 70 characters. Past that the network splits it: the handset may
-- chime per part and the operator charges per part. char_length() counts code points, which for Arabic is
-- exactly the UCS-2 unit count, so it is the right ruler here.
--
-- The values below are the longest of their kind in the database on 2026-09-23, rounded up. A template that
-- only fits the short ones is not fixed, so the test renders against the worst case, not a friendly one.

do $$
declare
  v_worst jsonb := jsonb_build_object(
    'name',          'Abdelhafidh soltani',
    'request_no',    'AGZ-2026-000041',
    'reference_no',  'AGZ-2026-000041',
    'contract_no',   'AGZ-CTR-2026-0041',
    'payment_no',    'AGZ-PAY-2026-0041',
    'visit_no',      'AGZ-VIS-2026-00001',
    'offer',         'ضيعة الدهماني (تجريبي)',
    'meeting_point', 'مدخل الضيعة الرئيسي',
    'slot',          '13:00-17:00',
    'date',          '30/09',
    -- Added 2026-09-25 with 0091's legal.appointment_set, which is the first template to use these two.
    -- Without them this loop could not render it at all: the placeholders stayed literal, the body measured
    -- long for the wrong reason and the «unfilled placeholder» assertion fired on a fixture gap rather than
    -- on a template fault. `place` is the same worst-case string as meeting_point, which is the longest
    -- location this database holds.
    'time',          '13:00',
    'place',         'مدخل الضيعة الرئيسي',
    'due_on',        '30/09/2026',
    'signed_on',     '30/09/2026',
    'amount',        '12 500 د',
    'trees',         '1200',
    'seq',           '3',
    'count',         '12',
    'missed',        '2');
  r      record;
  v_body text;
begin
  for r in select key, body_ar from public.message_templates where channel = 'sms' and is_active loop
    v_body := app.render_template(r.body_ar, v_worst);

    assert char_length(v_body) <= 70,
      format('%s renders to %s characters; an Arabic SMS holds 70, so this one is sent as %s messages: «%s»',
             r.key, char_length(v_body), ceil(char_length(v_body) / 67.0)::integer, v_body);

    -- A placeholder nobody fills is printed to the customer verbatim, braces and all.
    assert v_body !~ '\{[a-z_]+\}',
      format('%s leaves a placeholder unfilled: «%s»', r.key, v_body);
  end loop;
end $$;

-- The visit messages only fit because what fills them is short: app.visit_notify must keep passing the
-- compact date and the time range, not «DD/MM/YYYY» and the prose slot label (0079).
do $$
declare v_src text := pg_get_functiondef('app.visit_notify(uuid, text)'::regprocedure);
begin
  assert v_src like '%DD/MM''%' and v_src not like '%DD/MM/YYYY%',
    'visit_notify sends the short date; the year costs 5 of the 70 characters and a visit is days away';

  assert v_src like '%slot_from%' and v_src like '%slot_to%',
    'visit_notify builds the slot from the two time columns, not from the 25-character prose label';
end $$;
