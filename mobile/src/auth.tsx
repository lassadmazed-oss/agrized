import * as SecureStore from "expo-secure-store";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { siteUrl, supabase } from "./api";

/**
 * دخول الحريف, natively.
 *
 * WHAT THIS REPLACES AND WHY IT COULD NOT BE DONE BEFORE. The account tab opened /zitounti in the phone's
 * browser, and the comment there explained the obstacle honestly: the two steps before a password can even
 * be checked — the rate-limit gate and turning a phone number into the auth address — are revoked from anon
 * and authenticated, and this app ships the anon key, which anyone who installs it can read. Three routes on
 * the website now do exactly those steps with the service role and hand back a session:
 *
 *   POST /api/mobile/auth/code    { phone }           → an SMS code, the first time and after a forgotten password
 *   POST /api/mobile/auth/verify  { phone, code }     → a session
 *   POST /api/mobile/auth/login   { phone, password } → a session
 *
 * THE PASSWORD NEVER TOUCHES THIS FILE'S STORAGE. It is typed, posted once over HTTPS and forgotten. What
 * comes back and is kept are the two session tokens.
 *
 * WHY expo-secure-store AND NOT AsyncStorage. A refresh token is a standing key to this person's file — their
 * contracts, their instalments, their documents. AsyncStorage is a plain file in the app's sandbox, readable
 * on a rooted or jailbroken phone and swept up by some backup tools. SecureStore is the Keychain on iOS and
 * EncryptedSharedPreferences on Android, which is where a credential belongs. It is also why the whole
 * session is one entry rather than two: the Keychain charges a round trip per item.
 *
 * THE REASONS ARE NOT SENTENCES. The routes answer `bad_credentials`, `too_many`, `invalid_code`… and the
 * screen looks each one up in the owner's own `ui.login.*` rows. No Arabic is written here — if the owner
 * rewrites a refusal in the Back Office, the app says the new one without a deploy.
 */

const STORE_KEY = "agrized.client.session";

export type ClientPerson = { id: string; fullName: string | null };

type StoredSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number | null;
  person: ClientPerson;
};

export type AuthFailure =
  | "invalid_phone"
  | "phone_not_tunisian"
  | "invalid_request"
  | "bad_credentials"
  | "too_many"
  | "invalid_code"
  | "expired"
  | "no_code"
  | "too_many_attempts"
  | "sms_blocked"
  | "not_applied"
  | "offline"
  | "error";

export type AuthAnswer =
  | { ok: true }
  | { ok: false; reason: AuthFailure; retryAfterSeconds?: number; attemptsLeft?: number };

type AuthState = {
  /** The signed-in buyer, or null. `ready` says whether we have finished looking. */
  person: ClientPerson | null;
  ready: boolean;
  requestCode: (phone: string) => Promise<{ ok: true; ttlSeconds: number } | { ok: false; reason: AuthFailure }>;
  signInWithCode: (phone: string, code: string) => Promise<AuthAnswer>;
  signInWithPassword: (phone: string, password: string) => Promise<AuthAnswer>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  person: null,
  ready: false,
  requestCode: async () => ({ ok: false, reason: "error" }),
  signInWithCode: async () => ({ ok: false, reason: "error" }),
  signInWithPassword: async () => ({ ok: false, reason: "error" }),
  signOut: async () => {},
});

/** One POST to the website, with the network itself as a named failure rather than a thrown error. */
async function post(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(`${siteUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: response.status, json };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function reasonOf(json: Record<string, unknown>): AuthFailure {
  const reason = typeof json.reason === "string" ? json.reason : "error";
  return reason as AuthFailure;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [person, setPerson] = useState<ClientPerson | null>(null);
  const [ready, setReady] = useState(false);
  // Set when the tree goes away, so a slow restore does not set state on an unmounted provider.
  const gone = useRef(false);

  const keep = useCallback(async (stored: StoredSession) => {
    await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(stored)).catch(() => {});
    setPerson(stored.person);
  }, []);

  /**
   * The session from last time, handed to Supabase so `my_zitounti_file()` answers for this buyer.
   *
   * A refresh token that the server has retired — signed out elsewhere, password changed — fails here, and
   * the right answer is to forget it quietly and show the door. An app that keeps a dead session and fails
   * every read behind it looks broken rather than signed out.
   */
  useEffect(() => {
    gone.current = false;
    void (async () => {
      try {
        const raw = await SecureStore.getItemAsync(STORE_KEY);
        if (raw) {
          const stored = JSON.parse(raw) as StoredSession;
          const { error } = await supabase.auth.setSession({
            access_token: stored.accessToken,
            refresh_token: stored.refreshToken,
          });
          if (!gone.current) {
            if (error) await SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
            else setPerson(stored.person);
          }
        }
      } catch {
        await SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
      } finally {
        if (!gone.current) setReady(true);
      }
    })();
    return () => {
      gone.current = true;
    };
  }, []);

  const adopt = useCallback(
    async (json: Record<string, unknown>): Promise<AuthAnswer> => {
      const session = json.session as { accessToken?: string; refreshToken?: string; expiresAt?: number } | undefined;
      const who = json.person as { id?: string; fullName?: string | null } | undefined;
      if (!session?.accessToken || !session.refreshToken || !who?.id) return { ok: false, reason: "error" };

      const { error } = await supabase.auth.setSession({
        access_token: session.accessToken,
        refresh_token: session.refreshToken,
      });
      if (error) return { ok: false, reason: "error" };

      await keep({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        expiresAt: session.expiresAt ?? null,
        person: { id: who.id, fullName: who.fullName ?? null },
      });
      return { ok: true };
    },
    [keep],
  );

  const requestCode = useCallback<AuthState["requestCode"]>(async (phone) => {
    const answer = await post("/api/mobile/auth/code", { phone });
    if (!answer) return { ok: false, reason: "offline" };
    if (answer.status !== 200 || answer.json.ok !== true) return { ok: false, reason: reasonOf(answer.json) };
    return { ok: true, ttlSeconds: Number(answer.json.ttlSeconds ?? 300) };
  }, []);

  const signInWithCode = useCallback<AuthState["signInWithCode"]>(
    async (phone, code) => {
      const answer = await post("/api/mobile/auth/verify", { phone, code });
      if (!answer) return { ok: false, reason: "offline" };
      if (answer.status !== 200 || answer.json.ok !== true) {
        return {
          ok: false,
          reason: reasonOf(answer.json),
          attemptsLeft: typeof answer.json.attemptsLeft === "number" ? answer.json.attemptsLeft : undefined,
        };
      }
      return adopt(answer.json);
    },
    [adopt],
  );

  const signInWithPassword = useCallback<AuthState["signInWithPassword"]>(
    async (phone, password) => {
      const answer = await post("/api/mobile/auth/login", { phone, password });
      if (!answer) return { ok: false, reason: "offline" };
      if (answer.status !== 200 || answer.json.ok !== true) {
        return {
          ok: false,
          reason: reasonOf(answer.json),
          retryAfterSeconds:
            typeof answer.json.retryAfterSeconds === "number" ? answer.json.retryAfterSeconds : undefined,
        };
      }
      return adopt(answer.json);
    },
    [adopt],
  );

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
    await supabase.auth.signOut().catch(() => {});
    setPerson(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ person, ready, requestCode, signInWithCode, signInWithPassword, signOut }),
    [person, ready, requestCode, signInWithCode, signInWithPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

/**
 * The owner's row for each refusal — the website's own map, copied key for key.
 *
 * src/app/[lang]/(public)/zitounti/actions.ts holds MESSAGES and PASSWORD_MESSAGES; these are those, so the
 * app and the site say the same sentence to the same person and both change when the owner edits the row.
 * Written out rather than guessed: seven of the ten names tried first did not exist, which would have put
 * «ui.login.error_password» on the screen — the exact fault the skeleton work was for.
 *
 * `expired` AND `no_code` PRINT THE WORDS OF `invalid_code` ON PURPOSE, which is the website's note at the
 * top of that map: a stranger must not be able to tell a code that ran out from one that was never sent.
 * Giving them keys of their own would have leaked precisely that.
 */
export function failureKey(reason: AuthFailure): string {
  switch (reason) {
    case "invalid_phone":
      return "ui.login.error_invalid_phone";
    case "phone_not_tunisian":
      return "ui.errors.mobile_phone_not_tunisian";
    case "bad_credentials":
      return "ui.login.error_bad_credentials";
    case "too_many":
      return "ui.login.error_too_many_passwords";
    case "invalid_code":
    case "expired":
    case "no_code":
      return "ui.login.error_invalid_code";
    case "too_many_attempts":
      return "ui.login.error_too_many_attempts";
    // The provider or its configuration, not this reader's number — the website says this out loud for the
    // same reason: it is identical for every caller, so it reveals nothing about who has an account.
    case "sms_blocked":
      return "ui.login.error_sms_blocked";
    case "not_applied":
      return "ui.login.error_not_applied";
    case "offline":
      return "ui.offer.form_error_network";
    default:
      return "ui.login.error_generic";
  }
}
