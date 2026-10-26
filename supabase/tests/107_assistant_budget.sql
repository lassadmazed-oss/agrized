-- 0161 · the assistant closes when the day's ceiling is reached, and says so with its own sentence.
--
-- THIS FILE OWNS THE CEILINGS IT TESTS. They are read from settings, so asserting against whatever the
-- owner has set today would be asserting about his Back Office. Rolled back with the rest.
do $$
declare
  v_id    uuid;
  v_ok    boolean;
  v_why   text;
  v_locale text;
begin
  -- 1 · Both ceilings exist and are PRIVATE: they are the shape of the company's spending, and a visitor
  --     who can read them knows exactly how much noise it takes to close the assistant.
  assert exists (select 1 from public.settings s where s.key = 'assistant.max_questions_per_day'),
    'there is no daily question ceiling, so the API bill has none';
  assert exists (select 1 from public.settings s where s.key = 'assistant.max_tokens_per_day'),
    'there is no daily token ceiling, so one long conversation can cost what a hundred short ones do';
  assert not (select s.is_public from public.settings s where s.key = 'assistant.max_questions_per_day'),
    'the daily ceiling is published to the site';
  assert not (select s.is_public from public.settings s where s.key = 'assistant.max_tokens_per_day'),
    'the token ceiling is published to the site';

  -- 2 · The sentence a reader gets IS published, and exists in every language — this one is read by a
  --     potential client, on the public site, in whatever language he opened it in.
  assert (select s.is_public from public.settings s where s.key = 'assistant.budget_reached'),
    'the sentence shown when the ceiling is reached is not published to the site';
  foreach v_locale in array array['fr', 'de', 'it', 'en'] loop
    assert exists (select 1 from public.translations t
                    where t.entity = 'setting' and t.entity_key = 'assistant.budget_reached'
                      and t.field = 'value' and t.locale = v_locale),
      format('the ceiling sentence was never translated into %s', v_locale);
  end loop;
  assert (select s.value from public.settings s where s.key = 'assistant.budget_reached')
      <> (select s.value from public.settings s where s.key = 'assistant.rate_limited'),
    'the two sentences are the same, so a visitor who asked once is told he asked too much';

  -- 3 · THE QUESTION CEILING CLOSES THE ASSISTANT. Set to zero-plus-one against an empty day: the first
  --     question is allowed, the second is not, whoever asks it.
  delete from public.assistant_messages
   where created_at >= date_trunc('day', (now() at time zone 'Africa/Tunis')) at time zone 'Africa/Tunis';
  update public.settings set value = to_jsonb(1)       where key = 'assistant.max_questions_per_day';
  update public.settings set value = to_jsonb(9999999) where key = 'assistant.max_tokens_per_day';

  v_id := public.assistant_begin_turn('ip-one', 'سؤال');
  assert v_id is not null, 'the first question of the day was refused';

  -- A DIFFERENT VISITOR, so this proves the ceiling is on the day and not on the person.
  v_ok := false;
  begin
    perform public.assistant_begin_turn('ip-two', 'سؤال ثاني');
  exception when others then
    v_why := sqlerrm;
    v_ok := (sqlerrm = 'assistant_budget');
  end;
  assert v_ok, format('a second visitor was served past the daily ceiling (got «%s»)', coalesce(v_why, 'nothing'));

  -- 4 · AND THE TOKEN CEILING CLOSES IT TOO, which is the one a flood of short questions never reaches.
  --     Room is made on the question ceiling first, so only the tokens can be what refuses.
  update public.settings set value = to_jsonb(9999) where key = 'assistant.max_questions_per_day';
  update public.assistant_messages set tokens_in = 5000, tokens_out = 5000 where id = v_id;
  update public.settings set value = to_jsonb(1000) where key = 'assistant.max_tokens_per_day';

  v_ok := false;
  begin
    perform public.assistant_begin_turn('ip-three', 'سؤال ثالث');
  exception when others then
    v_ok := (sqlerrm = 'assistant_budget');
  end;
  assert v_ok, 'the token ceiling did not close the assistant';

  -- 5 · A ceiling of zero means «no ceiling», not «closed». Reading it the other way would shut the
  --     assistant off for everybody the moment somebody cleared the field in the Back Office.
  update public.settings set value = to_jsonb(0) where key = 'assistant.max_questions_per_day';
  update public.settings set value = to_jsonb(0) where key = 'assistant.max_tokens_per_day';
  assert public.assistant_begin_turn('ip-four', 'سؤال رابع') is not null,
    'a ceiling of zero closed the assistant instead of lifting the limit';

  -- 6 · The per-visitor throttle is still there and still its own reason: the two limits answer two
  --     different questions and a screen tells them apart by the word it is given.
  update public.settings set value = to_jsonb(1) where key = 'assistant.max_questions_per_hour';
  perform app.check_throttle('assistant', 'ip-five', interval '1 hour', 1);
  v_ok := false;
  begin
    perform public.assistant_begin_turn('ip-five', 'سؤال خامس');
  exception when others then
    v_ok := (sqlerrm = 'rate_limited');
  end;
  assert v_ok, 'one visitor over his own hourly share was not told so by name';

  raise notice 'assistant budget: the day has a ceiling in questions and in tokens, zero means no ceiling, and the two refusals have different names';
end $$;
