import { useCallback, useEffect, useState } from "react";

import { fetchGovernorates, fetchOffers, type Offer } from "./api";

/**
 * The offers, and the governorate names that turn an id into a place.
 *
 * ONE HOOK FOR EVERY SCREEN THAT NEEDS THEM. Three screens show offers — the home, the list and the
 * calculator — and each fetching for itself means three round trips on a cold start and three chances to be
 * in a different state. Here the two calls run together and every consumer gets the same four things: the
 * rows, the places, whether it is still loading, and how to try again.
 *
 * It refetches on mount rather than caching across screens: the stock behind these numbers changes when
 * somebody buys, and a price a visitor reads on a phone is the one thing that must not be stale.
 */
export function useOffers() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [places, setPlaces] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      const [rows, governorates] = await Promise.all([fetchOffers(), fetchGovernorates()]);
      setOffers(rows);
      setPlaces(new Map(governorates.map((g) => [g.id, g.name_ar])));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const placeOf = useCallback((offer: Offer) => places.get(offer.governorate_id) ?? "", [places]);

  return { offers, placeOf, loading, failed, reload: load };
}
