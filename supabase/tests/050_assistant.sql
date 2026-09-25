-- The site assistant (0080, 0081).

do $$
begin
  assert exists (select 1 from public.feature_flags where key = 'assistant'),
    'the assistant has a flag, so it can be switched off without a deploy';

  -- Every value that costs money is a row, not a constant in the code.
  assert (select count(*) from public.settings where key in
           ('assistant.model', 'assistant.max_offers', 'assistant.max_answer_chars',
            'assistant.max_questions_per_hour', 'assistant.max_question_chars')) = 5,
    'the model and the four spend limits are settings';

  assert (select s.value #>> '{}' from public.settings s where s.key = 'assistant.model') <> '',
    'a model is named';

  assert (select (s.value #>> '{}')::integer from public.settings s
           where s.key = 'assistant.max_questions_per_hour') between 1 and 1000,
    'the hourly cap is a real cap: unlimited questions is unlimited spend';
end $$;

-- ---------------------------------------------------------------------------
-- What the visitor may and may not read.
-- ---------------------------------------------------------------------------
--
-- The model name and the persona are not public: they are a spend decision and a prompt, and the browser
-- has no business with either. The window's own copy is public, because it is printed on the screen.

do $$
begin
  assert not exists (select 1 from public.settings where key in ('assistant.model', 'assistant.persona')
                      and is_public),
    'the model and the persona stay off the public config';

  assert (select count(*) from public.settings
           where key in ('assistant.title', 'assistant.greeting', 'assistant.suggestions') and is_public) = 3,
    'the window copy is public, because the browser draws it';

  -- The starter buttons are a list the Back Office edits; a string here would print as one long button.
  assert jsonb_typeof((select value from public.settings where key = 'assistant.suggestions')) = 'array',
    'the suggested questions are a json array';
end $$;

-- ---------------------------------------------------------------------------
-- The transcript is anonymous and staff-only.
-- ---------------------------------------------------------------------------

do $$
begin
  assert (select relrowsecurity from pg_class where oid = 'public.assistant_messages'::regclass),
    'assistant_messages has row level security on';

  -- Only the salted hash ever identifies a visitor. A name or a phone column here would turn an anonymous
  -- question into a record about a person.
  assert not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'assistant_messages'
       and column_name in ('full_name', 'phone', 'phone_e164', 'email', 'person_id')),
    'the assistant keeps no personal data about who asked';

  assert has_function_privilege('service_role', 'public.assistant_begin_turn(text, text)', 'execute'),
    'the route may open a turn';
  assert not has_function_privilege('anon', 'public.assistant_begin_turn(text, text)', 'execute'),
    'a visitor may not open a turn directly, which would skip the throttle';
  assert not has_function_privilege('authenticated', 'public.assistant_finish_turn(uuid, text, text, integer, integer, text)', 'execute'),
    'nobody but the route writes an answer down';
end $$;

-- A visitor must not be able to read what other visitors asked.
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

do $$
declare v_count integer;
begin
  select count(*) into v_count from public.assistant_messages;
  assert v_count = 0, 'anon reads no assistant message';
exception
  when insufficient_privilege then null; -- refused outright is the same guarantee, more bluntly
end $$;

reset role;
