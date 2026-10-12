"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";

/**
 * TOTP protects the Supabase account, not the ciphertext — the master password
 * is what decrypts. Worth being explicit about in the copy so the guarantee
 * isn't overstated.
 */
export function TwoFactorSetup({ onClose }: { onClose: () => void }) {
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [qr, setQr] = useState<{ svg: string; secret: string; factorId: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    void getSupabase().auth.mfa.listFactors().then(({ data }) => {
      setEnrolled((data?.totp?.length ?? 0) > 0);
    });
  }, []);

  async function begin() {
    setError(null);
    const { data, error } = await getSupabase().auth.mfa.enroll({ factorType: "totp" });
    if (error) return setError(error.message);
    setQr({ svg: data.totp.qr_code, secret: data.totp.secret, factorId: data.id });
  }

  async function confirm() {
    if (!qr) return;
    setError(null);
    const { data: challenge, error: cErr } = await getSupabase().auth.mfa.challenge({
      factorId: qr.factorId,
    });
    if (cErr) return setError(cErr.message);
    const { error: vErr } = await getSupabase().auth.mfa.verify({
      factorId: qr.factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (vErr) return setError("That code isn't right. Codes expire every 30 seconds.");
    setDone(true);
    setEnrolled(true);
  }

  async function remove() {
    const { data } = await getSupabase().auth.mfa.listFactors();
    const factor = data?.totp?.[0];
    if (!factor) return;
    await getSupabase().auth.mfa.unenroll({ factorId: factor.id });
    setEnrolled(false);
    setQr(null);
    setDone(false);
  }

  return (
    <div className="p-6 sm:p-8 max-w-xl space-y-6">
      <div>
        <h2 className="text-2xl tracking-tight">Two-factor login</h2>
        <p className="mt-2 text-muted text-[15px] leading-relaxed max-w-[52ch]">
          An authenticator code is required alongside your master password when
          signing in. It guards the account; your master password is still the
          only thing that can decrypt what&apos;s inside.
        </p>
      </div>

      {enrolled === null && <p className="text-muted text-sm">Checking…</p>}

      {enrolled === true && (
        <div className="space-y-4">
          <p className="text-brass text-sm">
            {done ? "Two-factor login is on." : "Two-factor login is already on."}
          </p>
          <button
            onClick={remove}
            className="h-10 px-4 rounded-md border border-line text-danger text-sm hover:border-danger transition-colors"
          >
            Turn off two-factor login
          </button>
        </div>
      )}

      {enrolled === false && !qr && (
        <button
          onClick={begin}
          className="h-10 px-5 rounded-md bg-brass text-ink font-medium hover:bg-[#d8b45c] transition-colors"
        >
          Set up an authenticator app
        </button>
      )}

      {enrolled === false && qr && (
        <div className="space-y-5">
          {/* Rendered via <img>, not injected into the DOM: script inside an
              SVG cannot execute in an image context, and this page holds the
              vault key in memory. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL
              has nothing for next/image to optimise, and this is a security
              choice rather than a convenience one. */}
          <img
            src={`data:image/svg+xml;base64,${btoa(qr.svg)}`}
            alt="QR code for setting up your authenticator app"
            width={176}
            height={176}
            className="bg-white p-2 rounded-md"
          />
          <p className="text-sm text-muted leading-relaxed">
            Scan this with your authenticator app, or enter the key by hand:
          </p>
          <code className="block font-mono text-sm break-all text-text select-all">
            {qr.secret}
          </code>

          <label className="block">
            <span className="block mb-2 text-sm text-muted">
              Then enter the six-digit code it shows
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              className="w-40 h-11 px-3 rounded-md bg-surface border border-line font-mono text-xl tracking-[0.3em] focus:border-brass outline-none transition-colors"
            />
          </label>

          <button
            onClick={confirm}
            className="h-10 px-5 rounded-md bg-brass text-ink font-medium hover:bg-[#d8b45c] transition-colors"
          >
            Turn on
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button onClick={onClose} className="text-sm text-muted hover:text-text transition-colors">
        Back to vault
      </button>
    </div>
  );
}
