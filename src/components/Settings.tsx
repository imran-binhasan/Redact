"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import {
  exportVaultJson,
  importVaultItems,
  type ItemContent,
  type VaultBackup,
  type VaultItem,
} from "@/lib/vault";
import { DeployGuide } from "./DeployGuide";

type SettingsTab = "2fa" | "backup" | "deploy";

export function Settings({
  encKey,
  items,
  onImported,
  onClose,
}: {
  encKey: CryptoKey;
  items: VaultItem[];
  onImported: (newItems: VaultItem[]) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<SettingsTab>("2fa");

  // 2FA state
  const [enrolled, setEnrolled] = useState<boolean | null>(null);
  const [qr, setQr] = useState<{ svg: string; secret: string; factorId: string } | null>(null);
  const [code, setCode] = useState("");
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Backup state
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getSupabase().auth.mfa.listFactors().then(({ data }) => {
      setEnrolled((data?.totp?.length ?? 0) > 0);
    });
  }, []);

  async function begin2Fa() {
    setTwoFactorError(null);
    const { data, error } = await getSupabase().auth.mfa.enroll({ factorType: "totp" });
    if (error) return setTwoFactorError(error.message);
    setQr({ svg: data.totp.qr_code, secret: data.totp.secret, factorId: data.id });
  }

  async function confirm2Fa() {
    if (!qr) return;
    setTwoFactorError(null);
    const { data: challenge, error: cErr } = await getSupabase().auth.mfa.challenge({
      factorId: qr.factorId,
    });
    if (cErr) return setTwoFactorError(cErr.message);
    const { error: vErr } = await getSupabase().auth.mfa.verify({
      factorId: qr.factorId,
      challengeId: challenge.id,
      code: code.trim(),
    });
    if (vErr) return setTwoFactorError("That code isn't right. Codes expire every 30 seconds.");
    setDone(true);
    setEnrolled(true);
  }

  async function remove2Fa() {
    const { data } = await getSupabase().auth.mfa.listFactors();
    const factor = data?.totp?.[0];
    if (!factor) return;
    await getSupabase().auth.mfa.unenroll({ factorId: factor.id });
    setEnrolled(false);
    setQr(null);
    setDone(false);
  }

  function handleExport() {
    const json = exportVaultJson(items);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `a3zen-vault-export-${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
    if (file.size > MAX_FILE_SIZE) {
      setImportStatus("File exceeds 5MB limit. Please select a valid vault backup.");
      return;
    }

    setIsImporting(true);
    setImportStatus(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as VaultBackup | ItemContent[];
      const itemsToImport = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.items)
          ? parsed.items
          : [];

      if (!itemsToImport.length) {
        throw new Error("No items found in this backup file.");
      }

      const created = await importVaultItems(encKey, itemsToImport);
      onImported(created);
      setImportStatus(`Successfully imported ${created.length} item${created.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setImportStatus(err instanceof Error ? err.message : "Failed to import items.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="p-6 sm:p-8 max-w-2xl space-y-6">
      {/* Navigation tabs */}
      <div className="flex items-center justify-between border-b border-line pb-4 flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("2fa")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === "2fa"
                ? "bg-surface-hi text-text font-medium"
                : "text-muted hover:text-text"
            }`}
          >
            Two-Factor Auth
          </button>
          <button
            onClick={() => setTab("backup")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === "backup"
                ? "bg-surface-hi text-text font-medium"
                : "text-muted hover:text-text"
            }`}
          >
            Backup & Export
          </button>
          <button
            onClick={() => setTab("deploy")}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              tab === "deploy"
                ? "bg-surface-hi text-text font-medium"
                : "text-muted hover:text-text"
            }`}
          >
            Deploy & Self-Host
          </button>
        </div>
        <button
          onClick={onClose}
          className="text-xs px-2.5 py-1.5 rounded bg-surface border border-line text-muted hover:text-text transition-colors"
        >
          Back to Vault
        </button>
      </div>

      {/* Tab: Deploy Guide */}
      {tab === "deploy" && <DeployGuide />}

      {/* Tab: Backup & Export */}
      {tab === "backup" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl tracking-tight font-medium">Backup & Data Portability</h2>
            <p className="mt-1 text-sm text-muted leading-relaxed">
              Because there is no master password reset, backing up your data guarantees you never
              lose access.
            </p>
          </div>

          {/* Export Box */}
          <div className="p-5 rounded-lg bg-surface border border-line space-y-4">
            <div>
              <h3 className="text-base font-medium text-text">Export Vault</h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Exports all {items.length} items as a decrypted JSON file. Store this file in a
                secure, encrypted offline drive or cold storage.
              </p>
            </div>
            <button
              onClick={handleExport}
              className="h-9 px-4 rounded-md bg-brass text-ink text-sm font-medium hover:bg-[#d8b45c] transition-colors"
            >
              Export Decrypted JSON
            </button>
          </div>

          {/* Import Box */}
          <div className="p-5 rounded-lg bg-surface border border-line space-y-4">
            <div>
              <h3 className="text-base font-medium text-text">Import Vault Backup</h3>
              <p className="text-xs text-muted mt-1 leading-relaxed">
                Restore items from a previous a3zen backup file. Each item will be encrypted
                client-side with your master key before storing.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFile}
                disabled={isImporting}
                className="text-xs text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-surface-hi file:text-text hover:file:bg-line cursor-pointer"
              />
              {isImporting && <span className="text-xs text-brass">Importing…</span>}
            </div>

            {importStatus && (
              <p
                role="status"
                className={`text-xs ${
                  importStatus.startsWith("Successfully") ? "text-brass" : "text-danger"
                }`}
              >
                {importStatus}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Tab: 2FA */}
      {tab === "2fa" && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl tracking-tight font-medium">Two-factor login</h2>
            <p className="mt-1 text-muted text-sm leading-relaxed max-w-[52ch]">
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
                onClick={remove2Fa}
                className="h-9 px-4 rounded-md border border-line text-danger text-sm hover:border-danger transition-colors"
              >
                Turn off two-factor login
              </button>
            </div>
          )}

          {enrolled === false && !qr && (
            <button
              onClick={begin2Fa}
              className="h-9 px-4 rounded-md bg-brass text-ink font-medium hover:bg-[#d8b45c] transition-colors text-sm"
            >
              Set up an authenticator app
            </button>
          )}

          {enrolled === false && qr && (
            <div className="space-y-5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
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
                  className="w-40 h-10 px-3 rounded-md bg-surface border border-line font-mono text-xl tracking-[0.3em] focus:border-brass outline-none transition-colors"
                />
              </label>

              <button
                onClick={confirm2Fa}
                className="h-9 px-4 rounded-md bg-brass text-ink font-medium hover:bg-[#d8b45c] transition-colors text-sm"
              >
                Turn on
              </button>
            </div>
          )}

          {twoFactorError && (
            <p role="alert" className="text-sm text-danger">
              {twoFactorError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
