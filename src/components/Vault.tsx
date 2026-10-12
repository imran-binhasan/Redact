"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSession, IDLE_LOCK_MS } from "@/lib/session";
import {
  createItem,
  deleteItem,
  loadItems,
  sanitizeUrl,
  searchItems,
  updateItem,
  type ItemContent,
  type VaultItem,
} from "@/lib/vault";
import { SecretValue } from "./SecretValue";
import { ItemEditor } from "./ItemEditor";
import { Settings } from "./Settings";

type Pane = { view: "detail" } | { view: "new" } | { view: "edit" } | { view: "settings" };

export function Vault({ encKey, email }: { encKey: CryptoKey; email: string }) {
  const { lock, msUntilLock } = useSession();
  const [items, setItems] = useState<VaultItem[] | null>(null);
  const [undecryptable, setUndecryptable] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pane, setPane] = useState<Pane>({ view: "detail" });
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadItems(encKey);
        if (cancelled) return;
        setItems(result.items);
        setUndecryptable(result.undecryptable);
        setLoadError(null);
      } catch {
        if (!cancelled) {
          setLoadError("Couldn't reach your vault. Check your connection, then reload.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [encKey]);

  const visible = useMemo(
    () => (items ? searchItems(items, query) : []),
    [items, query],
  );
  const selected = visible.find((i) => i.id === selectedId) ?? null;

  // Keyboard driving. Ignored while typing, except for Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;

      if (e.key === "Escape") {
        if (typing) {
          (target as HTMLElement).blur();
        } else if (pane.view !== "detail") {
          setPane({ view: "detail" });
        } else if (selectedId) {
          setSelectedId(null);
        } else {
          lock("manual");
        }
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "n") {
        e.preventDefault();
        setPane({ view: "new" });
        return;
      }
      if (e.key === "j" || e.key === "k") {
        e.preventDefault();
        if (!visible.length) return;
        const at = visible.findIndex((i) => i.id === selectedId);
        const next =
          e.key === "j"
            ? Math.min(at + 1, visible.length - 1)
            : Math.max(at - 1, 0);
        setSelectedId(visible[at === -1 ? 0 : next].id);
        setPane({ view: "detail" });
        return;
      }
      if (e.key === "c" && selected) {
        const value = selected.password ?? selected.body;
        if (value) void navigator.clipboard.writeText(value);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, selectedId, selected, pane.view, lock]);

  async function onCreate(content: ItemContent) {
    const item = await createItem(encKey, content);
    setItems((prev) => [item, ...(prev ?? [])]);
    setSelectedId(item.id);
    setPane({ view: "detail" });
  }

  async function onUpdate(content: ItemContent) {
    if (!selected) return;
    await updateItem(encKey, selected.id, content);
    setItems((prev) =>
      (prev ?? []).map((i) =>
        i.id === selected.id
          ? { ...i, ...content, updatedAt: new Date().toISOString() }
          : i,
      ),
    );
    setPane({ view: "detail" });
  }

  async function onDelete(item: VaultItem) {
    if (!confirm(`Delete "${item.title}"? This can't be undone.`)) return;
    await deleteItem(item.id);
    setItems((prev) => (prev ?? []).filter((i) => i.id !== item.id));
    setSelectedId(null);
  }

  const lockFraction = msUntilLock === null ? 1 : msUntilLock / IDLE_LOCK_MS;
  const lockMinutes = msUntilLock ? Math.floor(msUntilLock / 60000) : 0;
  const lockSeconds = msUntilLock ? Math.floor((msUntilLock % 60000) / 1000) : 0;
  const lockFormatted = msUntilLock
    ? `${lockMinutes}:${lockSeconds.toString().padStart(2, "0")}`
    : null;
  const showDetailOnMobile = selectedId !== null || pane.view !== "detail";

  return (
    <div className="min-h-dvh flex flex-col">
      {/* Time remaining before the idle lock. Honest about state rather than
          hiding it until the vault suddenly closes. */}
      <div
        aria-hidden
        className="h-px bg-brass origin-left transition-transform duration-1000 ease-linear"
        style={{ transform: `scaleX(${lockFraction})` }}
      />

      <header className="flex items-center gap-3 px-4 sm:px-5 h-14 border-b border-line">
        <h1 className="text-lg tracking-tight shrink-0 hidden sm:block font-medium">
          redact <span className="text-xs text-muted font-normal">/ a3zen</span>
        </h1>
        <input
          ref={searchRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your vault   /"
          className="flex-1 min-w-0 h-9 px-3 rounded-md bg-surface border border-line
                     placeholder:text-muted/60 focus:border-brass outline-none transition-colors"
        />
        <button
          onClick={() => setPane({ view: "new" })}
          className="h-9 px-3 shrink-0 rounded-md bg-brass text-ink text-sm font-medium hover:bg-[#d8b45c] transition-colors"
        >
          New
        </button>
        <button
          onClick={() => setPane({ view: "settings" })}
          className="h-9 px-3 shrink-0 rounded-md text-sm text-muted hover:text-text transition-colors hidden sm:block"
        >
          Settings
        </button>
        <button
          onClick={() => lock("manual")}
          className="h-9 px-3 shrink-0 rounded-md text-sm text-muted hover:text-text transition-colors flex items-center gap-1.5"
          title={lockFormatted ? `Auto-locks on idle in ${lockFormatted}` : "Lock vault"}
        >
          <span>Lock</span>
          {lockFormatted && (
            <span className="text-xs text-brass-dim font-mono hidden md:inline">
              ({lockFormatted})
            </span>
          )}
        </button>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* List */}
        <aside
          className={`w-full sm:w-80 lg:w-96 shrink-0 border-r border-line overflow-y-auto
                      ${showDetailOnMobile ? "hidden sm:block" : "block"}`}
        >
          {loadError && <p className="p-5 text-sm text-danger leading-relaxed">{loadError}</p>}

          {items === null && !loadError && (
            <p className="p-5 text-sm text-muted">Decrypting…</p>
          )}

          {items !== null && visible.length === 0 && (
            <p className="p-5 text-sm text-muted leading-relaxed">
              {query
                ? `Nothing matches "${query}".`
                : "Your vault is empty. Add your first login, key or note."}
            </p>
          )}

          <ul>
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  onClick={() => {
                    setSelectedId(item.id);
                    setPane({ view: "detail" });
                  }}
                  className={`w-full text-left px-5 py-3 border-b border-line/60 transition-colors
                    ${
                      item.id === selectedId
                        ? "bg-surface-hi"
                        : "hover:bg-surface"
                    }`}
                >
                  <span className="block truncate">{item.title || "Untitled"}</span>
                  <span className="block truncate text-sm text-muted mt-0.5">
                    {subtitle(item)}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {undecryptable.length > 0 && (
            <p className="p-5 text-sm text-danger leading-relaxed border-t border-line">
              {undecryptable.length} item{undecryptable.length > 1 ? "s" : ""} could
              not be decrypted. They were encrypted with a different master
              password, or the stored data was altered.
            </p>
          )}
        </aside>

        {/* Detail */}
        <section
          className={`flex-1 min-w-0 overflow-y-auto ${showDetailOnMobile ? "block" : "hidden sm:block"}`}
        >
          <MobileBack
            visible={showDetailOnMobile}
            onBack={() => {
              setSelectedId(null);
              setPane({ view: "detail" });
            }}
          />

          {pane.view === "settings" && (
            <Settings
              encKey={encKey}
              items={items ?? []}
              onImported={(newItems) => {
                setItems((prev) => [...newItems, ...(prev ?? [])]);
              }}
              onClose={() => setPane({ view: "detail" })}
            />
          )}

          {pane.view === "new" && (
            <ItemEditor onSave={onCreate} onCancel={() => setPane({ view: "detail" })} />
          )}

          {pane.view === "edit" && selected && (
            <ItemEditor
              initial={contentOf(selected)}
              onSave={onUpdate}
              onCancel={() => setPane({ view: "detail" })}
            />
          )}

          {pane.view === "detail" && selected && (
            <ItemDetail
              item={selected}
              onEdit={() => setPane({ view: "edit" })}
              onDelete={() => onDelete(selected)}
            />
          )}

          {pane.view === "detail" && !selected && (
            <div className="hidden sm:flex h-full items-center justify-center p-8">
              <dl className="text-sm text-muted space-y-2">
                {[
                  ["/", "search"],
                  ["j / k", "move through the list"],
                  ["n", "new item"],
                  ["c", "copy the secret"],
                  ["Esc", "back, then lock"],
                ].map(([key, what]) => (
                  <div key={key} className="flex gap-3">
                    <dt className="font-mono text-text w-16 shrink-0">{key}</dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
        </section>
      </div>

      <footer className="px-5 py-2 text-xs text-muted border-t border-line">
        {email} · locks after five idle minutes
      </footer>
    </div>
  );
}

function MobileBack({ visible, onBack }: { visible: boolean; onBack: () => void }) {
  if (!visible) return null;
  return (
    <button
      onClick={onBack}
      className="sm:hidden px-5 pt-4 text-sm text-muted hover:text-text transition-colors"
    >
      Back to list
    </button>
  );
}

function ItemDetail({
  item,
  onEdit,
  onDelete,
}: {
  item: VaultItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="p-6 sm:p-8 max-w-xl space-y-7">
      <header>
        <h2 className="text-2xl tracking-tight break-words">{item.title || "Untitled"}</h2>
        {item.tags && item.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2 mt-3">
            {item.tags.map((t) => (
              <li key={t} className="px-2 py-0.5 text-xs rounded bg-surface border border-line text-muted">
                {t}
              </li>
            ))}
          </ul>
        )}
      </header>

      <dl className="space-y-5">
        {item.username && (
          <Row label="Username">
            <span className="font-mono text-[15px] break-all select-all">{item.username}</span>
          </Row>
        )}
        {item.password && (
          <Row label="Password">
            <SecretValue key={item.id} value={item.password} label="Password" />
          </Row>
        )}
        {item.url && (() => {
          const safeUrl = sanitizeUrl(item.url);
          return (
            <Row label="Website">
              {safeUrl ? (
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brass hover:underline break-all"
                >
                  {item.url}
                </a>
              ) : (
                <span className="text-muted text-xs break-all" title="Blocked unsafe URI scheme">
                  {item.url} (unsafe link disabled)
                </span>
              )}
            </Row>
          );
        })()}
        {item.body && item.type === "secret" && (
          <Row label="Value">
            <SecretValue key={item.id} value={item.body} label="Value" />
          </Row>
        )}
        {item.body && item.type === "note" && (
          <Row label="Note">
            <p className="whitespace-pre-wrap leading-relaxed max-w-[70ch]">{item.body}</p>
          </Row>
        )}
      </dl>

      <div className="flex gap-3 pt-2 border-t border-line">
        <button
          onClick={onEdit}
          className="mt-5 h-10 px-4 rounded-md border border-line text-sm hover:border-brass-dim transition-colors"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="mt-5 h-10 px-4 rounded-md text-sm text-danger hover:bg-danger/10 transition-colors"
        >
          Delete
        </button>
      </div>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted mb-1.5">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function subtitle(item: VaultItem): string {
  if (item.type === "login") return item.username || item.url || "Login";
  if (item.type === "secret") return "Key or token";
  return item.body?.split("\n")[0]?.slice(0, 60) || "Note";
}

/** Strips the server-owned fields, leaving only what gets re-encrypted. */
function contentOf(item: VaultItem): ItemContent {
  return {
    type: item.type,
    title: item.title,
    username: item.username,
    password: item.password,
    url: item.url,
    body: item.body,
    tags: item.tags,
  };
}
