-- The assistant answers with gpt-4.1-mini, not gpt-4o-mini (measured 2026-09-23).
--
-- 0080 defaulted to gpt-4o-mini on the reasoning that it is the cheap one. Put in front of the real
-- prompt, with the real offers behind it, it was not usable: asked «قدّاش سوم الزيتونة في قربة؟» it
-- answered «ما فهمتش سؤالك», and it did the same for «نحب أرض مسقية وزياتين صغار» — questions the offer
-- list on screen answers outright. It was not refusing on policy; it simply could not follow a page of
-- Tunisian Arabic instructions and then read a table.
--
-- gpt-4.1-mini, same prompt, same three questions, same minute: it named the offers, compared them on
-- variety, age and price, and closed with a next step. It sits in the same cheap tier, and the difference
-- is the difference between a helper and an embarrassment.
--
-- This is a row, so trying another model costs an edit in Settings › assistant.model and no deploy. What
-- the code guarantees is not which model answers but what it may say: the offers come from the published
-- rows on every request, and a link is only drawn when the path exists (src/lib/assistant.ts).

update public.settings
   set value = to_jsonb('gpt-4.1-mini'::text),
       description_ar = 'إسم موديل OpenAI. gpt-4.1-mini رخيص ويفهم التونسي ويقرا قائمة العروض كيما يلزم. '
                        'gpt-4o-mini أرخص منّو أما ما يلحقش: يردّ «ما فهمتش» على أسئلة عادية.',
       updated_at = now()
 where key = 'assistant.model';
