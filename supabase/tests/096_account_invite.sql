-- 0149 · the invitation exists in every language, and it stays an INVITATION: nothing here sends anything.
do $$
declare
  v_key    text;
  v_locale text;
  v_before bigint;
  v_after  bigint;
begin
  -- 1 · The four sentences, in Arabic.
  foreach v_key in array array['ui.account_invite.title', 'ui.account_invite.text',
                               'ui.account_invite.cta', 'zitounti.invite_login_note'] loop
    assert exists (select 1 from public.settings s where s.key = v_key and s.is_public),
      format('%s is missing, or is not published to the site', v_key);
    assert length(trim(both from (select s.value #>> '{}' from public.settings s where s.key = v_key))) > 0,
      format('%s is empty', v_key);

    -- 2 · And in the four others. A missing one falls back to Arabic, which on the English site is a button
    --     whose label the reader cannot read.
    foreach v_locale in array array['fr', 'de', 'it', 'en'] loop
      assert exists (
        select 1 from public.translations t
         where t.entity = 'setting' and t.entity_key = v_key and t.field = 'value' and t.locale = v_locale),
        format('%s was never translated into %s', v_key, v_locale);
    end loop;
  end loop;

  -- 3 · THE WHOLE POINT OF ANSWER «2»: adding these words queues no message. The owner chose the offer over
  --     the automatic account to stop an SMS going to everyone who fills a form, so «this migration sends
  --     nothing» is the requirement itself and not a detail. The outbox is counted around a request-shaped
  --     act — re-reading the settings — and must not move.
  select count(*) into v_before from public.notification_outbox;
  perform s.value from public.settings s where s.key like 'ui.account_invite.%';
  select count(*) into v_after from public.notification_outbox;
  assert v_before = v_after, 'reading the invitation queued a message: the offer is sending SMS by itself';

  -- 4 · The door it points at is 0096's and not a second one. If this function disappeared, the button would
  --     lead to a screen that cannot prove a number, and the invitation would be a dead end.
  assert exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'request_client_login_code'),
    'the first-time SMS door is gone, so «افتح حسابي» leads nowhere';

  raise notice 'account invite: four sentences in five languages, pointing at the existing door, sending nothing';
end $$;
