-- Pending · SMS sender identity (owner, 2026-09-16): our messages must leave as «AGRIZED».
-- Nothing in the code carried a sender until now, so the name lives here like every other business value.
-- Spec: LEAD-11..12 (confirmation SMS), D-05 (provider, settled on WinSMS). Number claimed at apply time.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('sms.sender_id', to_jsonb('AGRIZED'::text), 'text', 'sms', 'اسم المرسل (Sender ID)',
   'الاسم اللي يقراه المواطن في خانة المرسل. من 2 إلى 11: أحرف لاتينية كبيرة وأرقام فقط، بلا فراغات. لازم يكون مقبولاً عند المزوّد قبل أول إرسال، وإلا الرسائل ما تخرجش.',
   false, 10),
  ('sms.provider', to_jsonb('winsms'::text), 'text', 'sms', 'مزوّد الرسائل القصيرة',
   'المزوّد اللي يخرج منّو الإرسال. يتسجّل في notification_outbox.provider مع كل رسالة تتبعث.',
   false, 20);
