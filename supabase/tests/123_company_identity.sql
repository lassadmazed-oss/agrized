-- 0179 · The company's legal identity: on the privacy page, in the footer, on the deposit receipt.

do $$
begin
  assert app.setting_text('legal.entity_name', '') like '%1983294D%', 'the legal name carries the RNE identifier';
  assert app.setting_text('site.contact_address', '') <> '', 'the address is filled';
  assert (select count(*) from public.translations where entity = 'setting' and entity_key = 'legal.entity_name'
            and locale in ('fr', 'de', 'it', 'en')) = 4, 'in the four other languages';
  assert pg_get_functiondef('public.field_receipt(uuid)'::regprocedure) like '%legal.entity_name%', 'the receipt names the company';
end $$;
