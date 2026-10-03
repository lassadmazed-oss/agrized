import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  catalogueOffers,
  fetchOffers,
  fetchStocks,
  liveOffers,
  type Offer,
  type OfferStock,
} from "./api";
import { type AppConfig } from "./config";
import { useConfig } from "./use-config";

/**
 * The offers and their stock — one read for every screen that shows an offer.
 *
 * ONE HOOK, BECAUSE THREE SCREENS CANNOT BE ALLOWED TO DISAGREE. The home, the catalogue and the offer screen
 * all show offers; each fetching for itself means three round trips on a cold start and three chances to be
 * in a different state. Here one read answers all of them, and every consumer gets the same view.
 *
 * THE CONFIGURATION IS NOT READ HERE. It comes from `<ConfigProvider>`, which reads the owner's 926 settings
 * rows and his flags ONCE above the navigator. This hook used to load them itself, which meant the app made
 * that read twice on every launch — once for the provider the tab bar answers from, once for whichever offer
 * screen mounted first. It is forwarded rather than hidden, so a screen that needs both takes one hook.
 *
 * TWO SETS OF OFFERS, BOTH THE SITE'S. `offers` is what is actually for sale — `liveOffers()`, which the home
 * page uses — and `catalogue` is every offer the visitor may see with the closed ones after the open ones,
 * which is what /projects lists. They come from the same single read; the difference is which question the
 * screen is asking.
 *
 * IT REFETCHES ON MOUNT rather than caching across screens: the stock behind these numbers changes when
 * somebody buys, and a price a visitor reads on a phone is the one thing that must not be stale.
 *
 * EACH PART FAILS ALONE. A stock read that did not answer costs a row its figures, not the screen. Only the
 * offers themselves make a screen say it could not read anything, because without them there is no catalogue
 * to draw.
 */

export type UseOffers = {
  /** On sale now: `offered && tree_count > 0`. What the home page lists. */
  offers: Offer[];
  /** Every visible offer, open ones first. What the catalogue lists. */
  catalogue: Offer[];
  /** The tree counts of each offer, by project id. Absent = not read, which is not the same as zero. */
  stocks: Map<string, OfferStock>;
  /** The owner's settings, flags and lists, forwarded from `<ConfigProvider>`. */
  config: AppConfig;
  /**
   * True once the configuration has actually been read.
   *
   * A SCREEN THAT GATES ON A FLAG HAS TO WAIT FOR THIS. `flagState` answers «disabled» for a key it has not
   * got yet, which is the right answer for a missing flag and the wrong one for a flag that has not arrived:
   * without this the catalogue would show «قريباً» for a third of a second on every cold start, which reads
   * as the module being shut rather than as the app still loading.
   */
  configLoaded: boolean;
  placeOf: (offer: Offer) => string;
  loading: boolean;
  failed: boolean;
  reload: () => Promise<void>;
};

export function useOffers(): UseOffers {
  const { config, ready, reload: reloadConfig } = useConfig();
  const [rows, setRows] = useState<Offer[]>([]);
  const [stocks, setStocks] = useState<Map<string, OfferStock>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  /** Set when the screen goes away, so a late answer does not set state on an unmounted tree. */
  const gone = useRef(false);
  /**
   * The provider hands back a fresh `reload` closure on every one of its renders, so it must never enter a
   * dependency array: `load` would change identity, the effect below would re-run, and the app would refetch
   * the catalogue in a loop. A ref is how a changing callback is called without being depended on.
   */
  const retryConfig = useRef(reloadConfig);
  retryConfig.current = reloadConfig;

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);

    let offers: Offer[];
    try {
      offers = await fetchOffers();
    } catch {
      if (!gone.current) {
        setFailed(true);
        setLoading(false);
      }
      return;
    }

    if (!gone.current) {
      // The offers are shown before their counts arrive: a row with its name, its place and its price is
      // worth more than a blank screen waiting on a second call, and the stock bar appears when it answers.
      setRows(offers);
      setLoading(false);
    }

    const counted = await fetchStocks(offers.map((offer) => offer.id)).catch(
      () => new Map<string, OfferStock>(),
    );
    if (!gone.current) setStocks(counted);
  }, []);

  /**
   * What a pull-to-refresh asks for, which is more than a mount does: the configuration too.
   *
   * It is NOT in `load`, deliberately. `load` runs on every mount of every screen that uses this hook, so a
   * config retry inside it would re-read the owner's 926 settings rows on every tab change — the exact
   * duplicate read moving the configuration into `<ConfigProvider>` removed. A reader who pulls the list down
   * is asking for everything; a reader who opened a tab is not.
   */
  const reload = useCallback(async () => {
    retryConfig.current();
    await load();
  }, [load]);

  useEffect(() => {
    gone.current = false;
    void load();
    return () => {
      gone.current = true;
    };
  }, [load]);

  const places = useMemo(
    () => new Map(config.governorates.map((governorate) => [governorate.id, governorate.name])),
    [config.governorates],
  );

  const placeOf = useCallback((offer: Offer) => places.get(offer.governorate_id) ?? "", [places]);

  const offers = useMemo(() => liveOffers(rows), [rows]);
  const catalogue = useMemo(() => catalogueOffers(rows), [rows]);

  return { offers, catalogue, stocks, config, configLoaded: ready, placeOf, loading, failed, reload };
}
