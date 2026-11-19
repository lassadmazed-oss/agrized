-- 0179 · The company's legal identity on the site and on the deposit receipt.
--
-- The owner, 2026-11-19, sent the extract of the Registre National des Entreprises (RNE, edited 2026-05-21):
-- AGRI ZED / أقري زاد, Société à Responsabilité Limitée, identifiant unique 1983294D, siège «طريق المطار كلم 11
-- واد الرمل 3023 صفاقس الشرقية صفاقس» (ROUTE MATAR KM 11, OUED RMAL 3023 Sfax Est Sfax), activity «زراعة
-- الزياتين» (01132). He approved («حطّهم») the three uses proposed to him:
--   1. legal.entity_name — the data controller on the privacy page, in its five languages;
--   2. site.contact_address — the address in the footer and on the privacy page;
--   3. the deposit receipt (0175 field_receipt) names the company and its address under the brand.
-- Both settings were empty; they are filled only while still empty, so an edit made in الإعدادات is kept.

update public.settings set value = to_jsonb('شركة أقري زاد (AGRI ZED)، ش.ذ.م.م، المعرّف الوحيد 1983294D'::text), updated_at = now()
 where key = 'legal.entity_name' and coalesce(value #>> '{}', '') = '';
update public.settings set value = to_jsonb('طريق المطار كلم 11، واد الرمل 3023، صفاقس الشرقية، صفاقس'::text), updated_at = now()
 where key = 'site.contact_address' and coalesce(value #>> '{}', '') = '';

insert into public.translations (entity, entity_key, field, locale, value, is_draft) values
  ('setting', 'legal.entity_name', 'value', 'fr', to_jsonb('AGRI ZED (أقري زاد), SARL, identifiant unique 1983294D'::text), true),
  ('setting', 'legal.entity_name', 'value', 'de', to_jsonb('AGRI ZED (أقري زاد), SARL, Unternehmenskennung (RNE) 1983294D'::text), true),
  ('setting', 'legal.entity_name', 'value', 'it', to_jsonb('AGRI ZED (أقري زاد), SARL, identificativo unico (RNE) 1983294D'::text), true),
  ('setting', 'legal.entity_name', 'value', 'en', to_jsonb('AGRI ZED (أقري زاد), SARL, unique identifier (RNE) 1983294D'::text), true),
  ('setting', 'site.contact_address', 'value', 'fr', to_jsonb('Route Matar km 11, Oued Rmal 3023, Sfax Est, Sfax, Tunisie'::text), true),
  ('setting', 'site.contact_address', 'value', 'de', to_jsonb('Route Matar km 11, Oued Rmal 3023, Sfax Est, Sfax, Tunesien'::text), true),
  ('setting', 'site.contact_address', 'value', 'it', to_jsonb('Route Matar km 11, Oued Rmal 3023, Sfax Est, Sfax, Tunisia'::text), true),
  ('setting', 'site.contact_address', 'value', 'en', to_jsonb('Route Matar km 11, Oued Rmal 3023, Sfax Est, Sfax, Tunisia'::text), true)
on conflict (entity, entity_key, field, locale) do nothing;

create or replace function public.field_receipt(p_payment uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare
  v_pay public.payments;
begin
  select * into v_pay from public.payments x where x.id = p_payment;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0001';
  end if;
  if not (app.is_staff() and (v_pay.recorded_by = auth.uid() or app.can_see_person(v_pay.person_id))) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'id', v_pay.id,
    'reference_no', v_pay.reference_no,
    'kind', v_pay.kind::text,
    'amount_millimes', v_pay.amount_millimes,
    'method_label', v_pay.method_label_ar,
    'received_at', v_pay.received_at,
    'voided', v_pay.voided_at is not null,
    'recorded_by', (select pr.full_name from public.profiles pr where pr.id = v_pay.recorded_by),
    'person', (select jsonb_build_object('full_name', p.full_name, 'phone_e164', p.phone_e164,
                                         'whatsapp_e164', p.whatsapp_e164)
                 from public.persons p where p.id = v_pay.person_id),
    'reservation', case when v_pay.reservation_id is null then null else app.reservation_payload(v_pay.reservation_id) end,
    'offer', (select jsonb_build_object('name', pj.name, 'code', pj.code,
                                        'governorate', (select g.name_ar from public.governorates g where g.id = pj.governorate_id),
                                        'delegation', (select d.name_ar from public.delegations d where d.id = pj.delegation_id))
                from public.projects pj where pj.id = v_pay.project_id),
    'title', app.setting_text('field.receipt_title', ''),
    'note', app.setting_text('field.receipt_note', ''),
    'contact_phone', app.setting_text('site.contact_phone', ''),
    -- 0179: the company that receives the money, as the national register names it.
    'company', app.setting_text('legal.entity_name', ''),
    'address', app.setting_text('site.contact_address', ''));
end $fn$;
revoke execute on function public.field_receipt(uuid) from public, anon;
grant execute on function public.field_receipt(uuid) to authenticated;

