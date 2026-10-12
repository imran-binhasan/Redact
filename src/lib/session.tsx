"use client";

/**
 * Holds the unlocked vault key for the life of a tab and nothing longer.
 *
 * The key is React state, never localStorage, sessionStorage, a cookie or an
 * IndexedDB record. Closing the tab, reloading, idling out or hitting Escape
 * all drop it, and the only way back in is the master password.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { deriveKeys } from "./crypto";
import { getSupabase } from "./supabase";

export const IDLE_LOCK_MS = 5 * 60 * 1000;

type State =
  | { status: "locked"; reason?: "idle" | "manual" }
  | { status: "unlocking" }
  | { status: "mfa" }
  | { status: "unlocked"; encKey: CryptoKey; email: string };

type SessionValue = {
  state: State;
  /** Milliseconds until the idle lock fires, or null when locked. */
  msUntilLock: number | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  submitTotp: (code: string) => Promise<void>;
  lock: (reason?: "idle" | "manual") => void;
  keepAlive: () => void;
};

const Ctx = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<State>({ status: "locked" });
  const [msUntilLock, setMsUntilLock] = useState<number | null>(null);
  // Held across the MFA step: the key is derived before Supabase confirms the
  // second factor, and is discarded if that step fails.
  const pendingKey = useRef<{ encKey: CryptoKey; email: string } | null>(null);
  const deadline = useRef<number>(0);

  const lock = useCallback((reason: "idle" | "manual" = "manual") => {
    pendingKey.current = null;
    setMsUntilLock(null);
    setState({ status: "locked", reason });
    void getSupabase().auth.signOut();
  }, []);

  const keepAlive = useCallback(() => {
    deadline.current = Date.now() + IDLE_LOCK_MS;
  }, []);

  /** Runs once both the password and any second factor have been accepted. */
  const finishUnlock = useCallback(() => {
    const pending = pendingKey.current;
    if (!pending) return;
    pendingKey.current = null;
    deadline.current = Date.now() + IDLE_LOCK_MS;
    setMsUntilLock(IDLE_LOCK_MS);
    setState({ status: "unlocked", ...pending });
  }, []);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setState({ status: "unlocking" });
      try {
        const { authHash, encKey } = await deriveKeys(password, email);
        const { error } = await getSupabase().auth.signInWithPassword({
          email,
          password: authHash,
        });
        if (error) throw new Error("That email and master password don't match.");

        pendingKey.current = { encKey, email };
        const { data } = await getSupabase().auth.mfa.getAuthenticatorAssuranceLevel();
        if (data?.nextLevel === "aal2" && data.nextLevel !== data.currentLevel) {
          setState({ status: "mfa" });
          return;
        }
        finishUnlock();
      } catch (e) {
        pendingKey.current = null;
        setState({ status: "locked" });
        throw e;
      }
    },
    [finishUnlock],
  );

  const signUp = useCallback(
    async (email: string, password: string) => {
      setState({ status: "unlocking" });
      try {
        const { authHash, encKey } = await deriveKeys(password, email);
        const { error } = await getSupabase().auth.signUp({ email, password: authHash });
        if (error) throw new Error(error.message);
        pendingKey.current = { encKey, email };
        finishUnlock();
      } catch (e) {
        pendingKey.current = null;
        setState({ status: "locked" });
        throw e;
      }
    },
    [finishUnlock],
  );

  const submitTotp = useCallback(
    async (code: string) => {
      const { data: factors, error: listError } = await getSupabase().auth.mfa.listFactors();
      if (listError) throw listError;
      const factor = factors?.totp?.[0];
      if (!factor) throw new Error("No authenticator app is set up on this account.");

      const { data: challenge, error: challengeError } =
        await getSupabase().auth.mfa.challenge({ factorId: factor.id });
      if (challengeError) throw challengeError;

      const { error } = await getSupabase().auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code,
      });
      if (error) throw new Error("That code isn't right. Codes expire every 30 seconds.");
      finishUnlock();
    },
    [finishUnlock],
  );

  // Idle lock. Activity pushes the deadline out; the ticker only reads it, so
  // moving the mouse never causes a re-render storm.
  useEffect(() => {
    if (state.status !== "unlocked") return;

    const bump = () => {
      deadline.current = Date.now() + IDLE_LOCK_MS;
    };
    const events = ["pointerdown", "keydown", "focus"] as const;
    for (const e of events) window.addEventListener(e, bump);

    const id = window.setInterval(() => {
      const left = deadline.current - Date.now();
      if (left <= 0) lock("idle");
      else setMsUntilLock(left);
    }, 1000);

    return () => {
      for (const e of events) window.removeEventListener(e, bump);
      window.clearInterval(id);
    };
  }, [state.status, lock]);

  const value = useMemo(
    () => ({ state, msUntilLock, signIn, signUp, submitTotp, lock, keepAlive }),
    [state, msUntilLock, signIn, signUp, submitTotp, lock, keepAlive],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
