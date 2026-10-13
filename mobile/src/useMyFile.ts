import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { fetchMyFile, type Failure, type ZitountiFile } from "./zitounti";

/**
 * The buyer's own file, read for whichever screen is asking — حسابي and each of the ten sections.
 *
 * ONE READER FOR TWO SCREENS. حسابي and `zitounti/[section]` held the same twenty lines each: the same
 * three pieces of state, the same `fetchMyFile`, the same guard against a late answer. Two copies of a
 * reader is two chances for one of them to be fixed and the other not — which had already happened once,
 * since only one of them re-read on focus.
 *
 * IT READS ON FOCUS, NOT ONLY ON MOUNT, and that is the owner's own bug report: «I did send the thing but
 * on the profile page I still get nothing is there, and I enter the page and I find it». The tabs keep
 * their screens mounted, so an effect with `[]` runs once — the file was read when the app opened and
 * never again, while the section screen mounted fresh and fetched, which is why it had the row the tab
 * said was missing. `useFocusEffect` runs each time the screen comes forward, which is the moment the
 * answer could have changed. It is one round trip to a function that returns the whole file.
 *
 * A QUIET READ IS NOT A LOUD ONE. A pull-to-refresh keeps what is on screen and lets the platform's own
 * spinner say that something is happening; it must not raise `loading` and replace the file with a
 * skeleton, because a reader who pulls is asking «is this still true», not «show me nothing for a second».
 * The first read of a visit, and the retry button after a failure, are loud: there is nothing to keep.
 *
 * NO ARITHMETIC AND NO WORDS. It hands back exactly what `my_zitounti_file()` answered and the reason it
 * did not; what that means in Arabic is the screen's business, from the owner's settings.
 */

export type MyFile = {
  file: ZitountiFile | null;
  failure: Failure | null;
  /** True while a read the skeleton is standing in for is in flight. A quiet read never raises it. */
  loading: boolean;
  /** Read again. `quiet` leaves the screen as it is, for the pull-to-refresh. */
  reload: (quiet?: boolean) => Promise<void>;
};

/**
 * `signedIn` is `null` while the Keychain has not answered yet — which is not the same as `false`.
 *
 * A session is read from secure storage at launch, and for that moment the honest answer to «does this
 * person have a file» is «ask again in a second». Collapsing it into `false` makes the section screen flash
 * its «you are not signed in» door at somebody who is, every single time they open it.
 */
export function useMyFile(signedIn: boolean | null): MyFile {
  const [file, setFile] = useState<ZitountiFile | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * Which read is the current one.
   *
   * A screen can be left and entered again before an answer lands, and the late one must not overwrite the
   * fresh one nor stop a spinner it is no longer turning. A counter says both in one comparison; the `gone`
   * flag this replaces could only ever say «stop», never «you are late» — and it left `loading` stuck true
   * whenever it fired.
   */
  const seq = useRef(0);

  const reload = useCallback(async (quiet = false) => {
    const mine = ++seq.current;
    if (!quiet) setLoading(true);
    const result = await fetchMyFile();
    if (mine !== seq.current) return;
    if (result.ok) {
      setFile(result.file);
      setFailure(null);
    } else {
      setFile(null);
      setFailure(result.reason);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Still looking in the Keychain: keep the skeleton rather than answering a question nobody has asked.
      if (signedIn === null) return;
      if (!signedIn) {
        // Signed out. Drop the previous reader's file so a second account never sees the first one's rows.
        seq.current++;
        setFile(null);
        setFailure(null);
        setLoading(false);
        return;
      }
      void reload();
    }, [reload, signedIn]),
  );

  return { file, failure, loading, reload };
}
