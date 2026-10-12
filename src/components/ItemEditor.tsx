"use client";

import { useState } from "react";
import type { ItemContent, ItemType } from "@/lib/vault";

const TYPES: { value: ItemType; label: string }[] = [
  { value: "login", label: "Login" },
  { value: "secret", label: "Key or token" },
  { value: "note", label: "Note" },
];

export function ItemEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ItemContent;
  onSave: (content: ItemContent) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<ItemContent>(
    initial ?? { type: "login", title: "" },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ItemContent>(key: K, value: ItemContent[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({ ...draft, title: draft.title.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="p-6 sm:p-8 space-y-6 max-w-xl">
      <div className="flex gap-1 p-1 rounded-lg bg-surface border border-line w-fit">
        {TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => set("type", t.value)}
            className={`px-3 h-8 text-sm rounded-md transition-colors ${
              draft.type === t.value
                ? "bg-surface-hi text-text"
                : "text-muted hover:text-text"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <Field label="Title">
        <input
          autoFocus
          required
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          className={inputClass}
        />
      </Field>

      {draft.type === "login" && (
        <>
          <Field label="Username">
            <input
              value={draft.username ?? ""}
              onChange={(e) => set("username", e.target.value)}
              className={inputClass + " font-mono"}
            />
          </Field>
          <Field label="Password">
            <div className="flex gap-2">
              <input
                value={draft.password ?? ""}
                onChange={(e) => set("password", e.target.value)}
                className={inputClass + " font-mono"}
              />
              <button
                type="button"
                onClick={() => set("password", generatePassword())}
                className="shrink-0 px-3 h-11 rounded-md border border-line text-sm text-muted hover:text-text hover:border-brass-dim transition-colors"
              >
                Generate
              </button>
            </div>
          </Field>
          <Field label="Website">
            <input
              value={draft.url ?? ""}
              onChange={(e) => set("url", e.target.value)}
              placeholder="https://"
              className={inputClass}
            />
          </Field>
        </>
      )}

      {draft.type === "secret" && (
        <Field label="Value">
          <textarea
            value={draft.body ?? ""}
            onChange={(e) => set("body", e.target.value)}
            rows={4}
            className={inputClass + " font-mono h-auto py-3 resize-y"}
          />
        </Field>
      )}

      {draft.type === "note" && (
        <Field label="Note">
          <textarea
            value={draft.body ?? ""}
            onChange={(e) => set("body", e.target.value)}
            rows={12}
            className={inputClass + " h-auto py-3 resize-y leading-relaxed"}
          />
        </Field>
      )}

      <Field label="Tags, separated by commas">
        <input
          value={(draft.tags ?? []).join(", ")}
          onChange={(e) =>
            set(
              "tags",
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
          className={inputClass}
        />
      </Field>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="h-10 px-5 rounded-md bg-brass text-ink font-medium hover:bg-[#d8b45c] disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 px-5 rounded-md text-muted hover:text-text transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
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

const ALPHABET =
  "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%^&*-_=+";

/**
 * Rejection sampling. `byte % 69` would very slightly favour the first few
 * characters of the alphabet; the bias is tiny but there is no reason to accept
 * any in a password generator, so out-of-range bytes are discarded instead.
 */
function generatePassword(length = 24): string {
  const n = ALPHABET.length;
  const limit = Math.floor(256 / n) * n; // largest multiple of n under 256
  const out: string[] = [];
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length))) {
      if (b >= limit) continue;
      out.push(ALPHABET[b % n]);
      if (out.length === length) break;
    }
  }
  return out.join("");
}
