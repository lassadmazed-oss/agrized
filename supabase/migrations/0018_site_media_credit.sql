-- 0018 · Photo credits on the site's picture slots
--
-- Some of the site's photographs are published under Creative Commons BY, which requires naming the
-- author. The credit lives on the slot, next to the picture it belongs to, and the footer prints
-- every credit that is set — so swapping a picture from the Back Office swaps its credit with it.

alter table public.site_media
  add column if not exists credit_text text,
  add column if not exists credit_url  text;

alter table public.site_media
  add constraint site_media_credit_url_shape check (credit_url is null or credit_url ~ '^https://[^ ]+$');

comment on column public.site_media.credit_text is
  'Author and licence as they must be displayed, e.g. "Jane Doe · CC BY 2.0". Empty for own or CC0 pictures.';
