-- The Facebook page's real id (2026-11-18). 0157 recorded the page under 61592854362769, the number in its public
-- address (facebook.com/profile.php?id=…). Meta Business Suite's own settings name the Page ID 1275705932287730 —
-- the id the Graph API posts to (/{page-id}/photos, /{page-id}/feed). The Back Office fills the token form with
-- this row's id, so it has to be the one Meta answers to.
--
-- Test: supabase/tests/115_facebook_page.sql (its last assertion follows this change).
--
-- The site's link (site.facebook_url) keeps the public address: both open the same page.

update public.social_accounts
   set external_id = '1275705932287730'
 where network = 'facebook'
   and external_id = '61592854362769'
   and not exists (select 1 from public.social_accounts a where a.network = 'facebook' and a.external_id = '1275705932287730');
