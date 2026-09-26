-- 0106 · Three more vocabularies the client screen prints and the owner could not edit.
--
-- WHAT 0105 DID NOT CATCH. That file swept the SENTENCES — the titles, hints and buttons read through
-- settingText — and seeded the twenty-five that had no row. It did not look at the WORD MAPS: the small
-- Record<string,string> tables that turn a database enum into Arabic. Three of those are printed straight
-- out of the TypeScript with no settings lookup at all:
--
--   agri_operations.status        «مبرمجة» «في الطريق» «تعملت» «تعدّت»     sections.tsx:718
--   subscriptions.payment_status  «ما تخلّصش» «تخلّص جزء» «تخلّص»          sections.tsx:755
--   the document kind             «عقد» «مخطط الغراسة»                      sections.tsx:901
--
-- The other three in that file were already right and are the pattern this follows: reservationStatusAr and
-- paymentKindAr read `reservations.status_labels` and `payments.kind_labels` and fall back to the literal,
-- and visitStatusAr reads one `visits.status_<code>` key per status the way 0064 seeded them.
--
-- WHY A MAP AND NOT ONE KEY PER VALUE. Both shapes exist in this database and both are defensible; the rule
-- that decides is how many there are and whether the set is closed. `visits.status_*` is five keys because a
-- visit's five states each earn their own box in الإعدادات. These three are four, three and two values of a
-- fixed enum that only a migration can extend, so one json row each keeps الإعدادات readable — the same
-- argument payments.kind_labels and contracts.status_labels already made.
--
-- THE SEEDED WORDS ARE THE LITERALS THE SCREEN ALREADY PRINTS, character for character. Nothing changes on
-- screen today. What changes is that «تعدّت» becomes a word the owner can rewrite without a deployment, and
-- that his rewrite reaches the client's screen instead of sitting in a settings row nothing reads.

do $guard$
begin
  if to_regclass('public.agri_operations') is null then
    raise exception
      'public.agri_operations is missing; these labels describe its status column. Apply 0066_agri_services.sql first.';
  end if;
end $guard$;

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  -- `done` and `executed` both appear: public.agri_operations.status is ('planned','done','cancelled') per
  -- 0066, and the client screen also renders 'executed' and 'in_progress' because app.zitounti_operations
  -- may report an operation's derived state. Every value the screen can receive is named, so nothing falls
  -- through to a bare English code on a client's phone.
  ('agri.operation_status_labels', jsonb_build_object(
      'planned',     'مبرمجة',
      'in_progress', 'في الطريق',
      'done',        'تعملت',
      'executed',    'تعملت',
      'skipped',     'تعدّت',
      'cancelled',   'تلغات'),
   'json', 'agri', 'العمليات الفلاحية · أسماء الحالات',
   'الكلمة اللي يقراها الحريف على كل عملية فلاحية. المفتاح ثابت والكلمة متاعك.', true, 400),

  ('subscriptions.payment_labels', jsonb_build_object(
      'unpaid',  'ما تخلّصش',
      'partial', 'تخلّص جزء',
      'paid',    'تخلّص'),
   'json', 'subscriptions', 'الاشتراك · حالة الخلاص',
   'الكلمة اللي تتكتب على حالة خلاص الاشتراك في فضاء «زيتونتي».', true, 400),

  -- The document «kind» is not a database enum: app.zitounti_documents (0095) builds it, and it emits
  -- exactly two values — a signed contract and the offer's plan. Named here so a third one added later
  -- arrives as a missing label rather than as an English word on a client's screen.
  ('zitounti.document_kind_labels', jsonb_build_object(
      'contract',   'عقد',
      'offer_plan', 'مخطط الغراسة'),
   'json', 'zitounti', 'زيتونتي · أنواع الوثائق',
   'اسم كل نوع وثيقة في قسم «الوثائق».', true, 200)
on conflict (key) do nothing;

do $verify$
declare
  v_missing text;
begin
  select string_agg(k, ', ') into v_missing
  from unnest(array['agri.operation_status_labels', 'subscriptions.payment_labels',
                    'zitounti.document_kind_labels']) k
  where not exists (select 1 from public.settings s where s.key = k);
  if v_missing is not null then
    raise exception 'these label maps did not take: %', v_missing;
  end if;
end $verify$;
