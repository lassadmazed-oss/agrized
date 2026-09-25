-- The sender goes from AGRIZED to MAZED (owner, 2026-09-23).
--
-- WHY. AGRIZED is «Validé» in the WinSMS console and the API accepts it: every send returns code `ok`, a
-- reference, and a debited balance. Not one of those messages reached a handset. On 2026-09-23 the owner
-- received a message sent from MAZED on the same account, to the same number, over the same code path —
-- and still nothing from AGRIZED. That is the whole diagnosis: the account, the numbers, the credit and
-- our request are all fine, and AGRIZED alone is dropped after WinSMS hands it over.
--
-- WinSMS's own sender-id guidance says why: Tunisian operators block sender ids they judge undesirable,
-- independently of the validation WinSMS itself performs. A sender is therefore validated in two places,
-- and the console only shows the first.
--
-- MAZED is the one sender on this account with delivery evidence behind it, so the platform uses it until
-- WinSMS gets AGRIZED cleared with the operators. Nothing here is permanent: it is one row in `settings`,
-- editable at Settings › sms.sender_id, and the send path re-reads it on every message (no deploy, no
-- restart, no cache — see readSmsConfig in src/lib/sms.ts).

update public.settings
   set value = to_jsonb('MAZED'::text),
       description_ar = 'الإسم اللي يظهر للمرسل إليه. AGRIZED مقبول عند WinSMS أما الشبكات التونسية ما توصّلوش، '
                        'على هذا نستعملو MAZED. بدّلها كي يتسجّل AGRIZED عند الشبكات.',
       updated_at = now()
 where key = 'sms.sender_id';
