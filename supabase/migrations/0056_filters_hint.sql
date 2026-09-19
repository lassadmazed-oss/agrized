-- The sentence above the filters describes the filters that are there.
--
-- It read «صفّي حسب الولاية أو نمط التملك أو المساحة أو عدد الزيتونات. الأراضي البيضاء تظهر دايماً مهما كان عدد
-- الزيتونات المختار.» — four filters and a rule about a fifth. The offers page now carries three controls: the
-- governorate, its delegation, and «المتوفّر فقط». The others went with the parcel layer they filtered:
--
--   · «المساحة» was drawn from the desired_area list, which holds five bands of which none is active, so the
--     select offered «الكل» and nothing else and could never match an offer.
--   · «عدد الزيتونات» and the white-land rule it carried were about parcels: an offer is not cut into plots any
--     more, so «الأراضي البيضاء تظهر دايماً» describes a case that cannot arise.
--   · «نمط التملك» and the maximum cash price filtered a catalogue of plots. With offers sold by the tree, the
--     card already states the price per tree and the visitor compares two of them on one screen.
--
-- A hint that promises controls the page does not have is worse than no hint: the reader looks for them. This
-- says what is actually there. It is a setting, so the owner rewrites it — or empties it, which hides it — from
-- the Back Office, and re-adding a filter is a line of code plus a word here.

update public.settings set value = to_jsonb(
  'صفّي حسب الولاية والمعتمدية، ولّا خلّي «المتوفّر فقط» باش ما تشوفش كان العروض اللي فيها زيتونات مازالت متاحة.'::text
), updated_at = now()
where key = 'projects.filters_hint';
