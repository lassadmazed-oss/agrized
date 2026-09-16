-- Pending · The instalment sentence the owner asked for, on a line the calculator actually renders.
--   «التقسيط وسيلة لتسهيل البداية. بمبلغ شهري بسيط يتحول الإدخار لأصل حقيقي وملموس»
--
-- 0040 put it in start.capacity_hint, which nothing reads: startCopy() has not asked for start.capacity_*
-- since the v3 calculator replaced the capacity step with payment/down/duration, so the sentence rendered
-- nowhere. This adds the line under «كيفاش تحب تخلّص؟» and marks the dead pair so nobody edits it again.
-- The dead keys stay in place: test 005 asserts all four exist and are public.
-- Spec: MIL-02, PRN-02. Number claimed at apply time.

insert into public.settings (key, value, value_type, group_key, label_ar, description_ar, is_public, sort_order) values
  ('start.payment_hint',
   to_jsonb($t$التقسيط وسيلة تسهّل البداية: بمبلغ شهري بسيط يتحوّل الإدخار لأصل حقيقي وملموس.$t$::text),
   'text', 'site', 'النص تحت سؤال طريقة الدفع',
   'يظهر في الحاسبة تحت «كيفاش تحب تخلّص؟». اتركه فارغاً باش ما يظهرش.', true, 366),
  ('start.payment_hint_fr',
   to_jsonb($t$Les mensualités facilitent le départ : un petit montant mensuel transforme votre épargne en un actif réel et tangible.$t$::text),
   'text', 'site', 'النص تحت سؤال طريقة الدفع (فرنسي)',
   'السطر الفرنسي تحت النص العربي في الحاسبة.', true, 367);

-- The pair the v3 calculator left behind: still readable, no longer worth editing.
update public.settings
set description_ar = $t$غير مستعمل حالياً: الحاسبة v3 عوّضت خطوة «قدرتك المالية» بأسئلة طريقة الدفع والتسبقة والمدة. للنص اللي يظهر استعمل «النص تحت سؤال طريقة الدفع».$t$
where key in ('start.capacity_title', 'start.capacity_hint', 'start.capacity_title_fr', 'start.capacity_hint_fr');
