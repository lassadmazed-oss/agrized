import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import { EMPTY_CONFIG, loadConfig, type AppConfig } from "./config";

/**
 * The configuration, read once at launch and handed to every screen.
 *
 * WHY ONCE AND NOT PER SCREEN. The website renders on a server that already holds `getPublicConfig()`, so
 * every page knows the owner's words and his flags before it draws a single pixel. An app has to fetch them,
 * and four screens fetching for themselves is four round trips on a cold start and four chances to disagree
 * about which modules are open — one tab offering a calculator the next screen says is closed. So it is one
 * read, above the navigator, and the tab bar and the screens all answer from it.
 *
 * THE FIRST FRAME WAITS, BRIEFLY. `t()` prints a key's own name when the key is missing, which is the right
 * behaviour for a gap and the wrong behaviour for a read still in flight: nobody should see «site.tab_home»
 * under a tab icon for half a second. So the splash is held until the read settles — and it is HELD UNTIL IT
 * SETTLES, not until it succeeds, because a phone in a grove loses signal and an app that never leaves its
 * splash screen is worse than an app that opens and says what went wrong.
 *
 * A FAILED READ IS NOT AN EMPTY ONE. `failed` is carried separately so a screen can say the owner's own
 * network sentence (`ui.offer.form_error_network`) and offer to try again, instead of drawing a shell full of
 * printed key names. With no flags at all every module reads as shut — `flagState`'s rule — which is the
 * conservative answer and the same one the website gives when its own config cannot be read.
 */

type ConfigState = {
  config: AppConfig;
  /** True until the first read settles. Screens under the held splash never see it. */
  loading: boolean;
  /** The settings read did not answer. The lists may still have. */
  failed: boolean;
  reload: () => void;
  /** Resolves when the first read settles, so the root layout knows when to drop the splash. */
  ready: boolean;
};

const ConfigContext = createContext<ConfigState>({
  config: EMPTY_CONFIG,
  loading: true,
  failed: false,
  reload: () => {},
  ready: false,
});

export function ConfigProvider({ children, onReady }: { children: ReactNode; onReady?: () => void }) {
  const [config, setConfig] = useState<AppConfig>(EMPTY_CONFIG);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const announced = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setConfig(await loadConfig());
    } catch {
      // The owner's own sentence is shown by the screens; nothing is invented here.
      setFailed(true);
    } finally {
      setLoading(false);
      setReady(true);
      if (!announced.current) {
        announced.current = true;
        onReady?.();
      }
    }
  }, [onReady]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ConfigContext.Provider value={{ config, loading, failed, reload: () => void load(), ready }}>
      {children}
    </ConfigContext.Provider>
  );
}

export function useConfig(): ConfigState {
  return useContext(ConfigContext);
}
