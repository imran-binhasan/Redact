"use client";

import { useState } from "react";
import { useSession } from "@/lib/session";
import { isSupabaseConfigured } from "@/lib/supabase";
import { DeployGuide } from "./DeployGuide";

type Mode = "signin" | "signup";

export function Unlock() {
  const { state, signIn, signUp, submitTotp } = useSession();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showDeployGuide, setShowDeployGuide] = useState(() => !isSupabaseConfigured());

  const busy = state.status === "unlocking";
  const needsTotp = state.status === "mfa";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (needsTotp) {
        await submitTotp(code.trim());
        return;
      }
      if (mode === "signup") {
        if (password !== confirm) throw new Error("The two passwords don't match.");
        if (password.length < 12)
          throw new Error("Use at least 12 characters. This is the only key to your vault.");
        await signUp(email.trim(), password);
      } else {
        await signIn(email.trim(), password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setCode("");
    }
  }

  if (showDeployGuide) {
    return (
      <main className="min-h-dvh grid place-items-center px-4 py-12">
        <DeployGuide
          onClose={isSupabaseConfigured() ? () => setShowDeployGuide(false) : undefined}
        />
      </main>
    );
  }

  return (
    <main className="min-h-dvh grid place-items-center px-6 py-16">
      <div className="w-full max-w-sm">
        <header className="mb-10">
          <div className="flex items-baseline gap-2.5">
            <h1 className="text-5xl tracking-tight font-medium">redact</h1>
            <span className="text-xs text-brass-dim font-mono tracking-widest uppercase">by a3zen</span>
          </div>
          <p className="mt-3 text-muted text-[15px] leading-relaxed max-w-[42ch]">
            Everything is encrypted on this device before it is stored. The server
            keeps sealed blocks it has no way to open.
          </p>
        </header>

        {state.status === "locked" && state.reason === "idle" && (
          <p className="mb-6 text-sm text-brass">
            Locked after five minutes of no activity.
          </p>
        )}

        <form onSubmit={onSubmit} className="space-y-5">
          {needsTotp ? (
            <Field label="Six-digit code from your authenticator app">
              <input
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                className={inputClass + " font-mono text-2xl tracking-[0.4em]"}
                placeholder="000000"
              />
            </Field>
          ) : (
            <>
              <Field label="Email">
                <input
                  autoFocus
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  className={inputClass}
                />
              </Field>

              <Field label="Master password">
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  className={inputClass + " font-mono"}
                />
              </Field>

              {mode === "signup" && (
                <Field label="Master password again">
                  <input
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                    className={inputClass + " font-mono"}
                  />
                </Field>
              )}
            </>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger leading-relaxed">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full h-11 rounded-md bg-brass text-ink font-medium
                       hover:bg-[#d8b45c] disabled:opacity-50 disabled:cursor-wait
                       transition-colors"
          >
            {busy
              ? "Deriving your key…"
              : needsTotp
                ? "Verify"
                : mode === "signup"
                  ? "Create vault"
                  : "Unlock"}
          </button>
        </form>

        {mode === "signup" && !needsTotp && (
          <p className="mt-6 text-sm text-brass leading-relaxed border-l-2 border-brass-dim pl-4">
            Write this password down somewhere physical before you continue. It is
            never sent anywhere, so nobody — including you — can reset it. Lose it
            and the vault stays sealed for good.
          </p>
        )}

        {!needsTotp && (
          <div className="mt-8 flex items-center justify-between gap-4 text-sm text-muted">
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signin" ? "signup" : "signin");
                setError(null);
              }}
              className="hover:text-text transition-colors"
            >
              {mode === "signin" ? "Set up a new vault" : "I already have a vault"}
            </button>

            <button
              type="button"
              onClick={() => setShowDeployGuide(true)}
              className="text-xs hover:text-text transition-colors flex items-center gap-1 text-brass-dim hover:text-brass"
            >
              <span>Deploy & Self-Host</span>
              <span aria-hidden>↗</span>
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

const inputClass =
  "w-full h-11 px-3 rounded-md bg-surface border border-line text-text " +
  "placeholder:text-muted/50 focus:border-brass outline-none transition-colors";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block mb-2 text-sm text-muted">{label}</span>
      {children}
    </label>
  );
}
