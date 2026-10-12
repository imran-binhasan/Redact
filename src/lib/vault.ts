/**
 * Vault CRUD. Every value a human would care about is encrypted before it
 * reaches this layer's network calls; the Supabase rows are opaque blobs.
 */
import { getSupabase } from "./supabase.ts";
import { encryptJson, decryptJson, type Envelope } from "./crypto.ts";

export type ItemType = "login" | "note" | "secret";

/** The decrypted shape. All of this lives inside `ciphertext` on the server. */
export type ItemContent = {
  type: ItemType;
  title: string;
  /** login */
  username?: string;
  password?: string;
  url?: string;
  /** note / secret */
  body?: string;
  tags?: string[];
};

export type VaultItem = ItemContent & {
  id: string;
  createdAt: string;
  updatedAt: string;
};

type Row = {
  id: string;
  ciphertext: string;
  iv: string;
  created_at: string;
  updated_at: string;
};

/** An item that fails to decrypt is surfaced, never silently dropped. */
export type LoadResult = { items: VaultItem[]; undecryptable: string[] };

export async function loadItems(encKey: CryptoKey): Promise<LoadResult> {
  const { data, error } = await getSupabase()
    .from("vault_items")
    .select("id, ciphertext, iv, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  const items: VaultItem[] = [];
  const undecryptable: string[] = [];

  for (const row of (data ?? []) as Row[]) {
    try {
      const content = await decryptJson<ItemContent>(encKey, row.id, row);
      items.push({ ...content, id: row.id, createdAt: row.created_at, updatedAt: row.updated_at });
    } catch {
      undecryptable.push(row.id);
    }
  }
  return { items, undecryptable };
}

/**
 * Strict URL sanitization: only permits http: and https: protocols to prevent
 * javascript:, data:, and other execution vectors.
 */
export function sanitizeUrl(raw?: string): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const parsed = new URL(withProto);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.href;
    }
    return null;
  } catch {
    return null;
  }
}

/** Bounds-checks item strings to prevent storage abuse and browser lockups. */
export function sanitizeItemContent(content: ItemContent): ItemContent {
  const sanitizeStr = (s?: string, max = 500) => (s ? s.slice(0, max) : undefined);
  return {
    type: content.type === "login" || content.type === "secret" || content.type === "note" ? content.type : "login",
    title: sanitizeStr(content.title, 500) || "Untitled",
    username: sanitizeStr(content.username, 500),
    password: sanitizeStr(content.password, 50000),
    url: sanitizeStr(content.url, 2048),
    body: sanitizeStr(content.body, 500000),
    tags: Array.isArray(content.tags)
      ? content.tags.slice(0, 30).map((t) => String(t).slice(0, 50).trim()).filter(Boolean)
      : undefined,
  };
}

export async function createItem(encKey: CryptoKey, content: ItemContent): Promise<VaultItem> {
  const clean = sanitizeItemContent(content);
  // The id is generated client-side because it is bound into the ciphertext as
  // additional authenticated data, so it must exist before encrypting.
  const id = crypto.randomUUID();
  const env = await encryptJson(encKey, id, clean);
  const { data, error } = await getSupabase()
    .from("vault_items")
    .insert({ id, ...env })
    .select("id, created_at, updated_at")
    .single();
  if (error) throw error;
  return { ...clean, id, createdAt: data.created_at, updatedAt: data.updated_at };
}

export async function updateItem(
  encKey: CryptoKey,
  id: string,
  content: ItemContent,
): Promise<void> {
  const clean = sanitizeItemContent(content);
  const env: Envelope = await encryptJson(encKey, id, clean);
  const { error } = await getSupabase().from("vault_items").update(env).eq("id", id);
  if (error) throw error;
}

export async function deleteItem(id: string): Promise<void> {
  const { error } = await getSupabase().from("vault_items").delete().eq("id", id);
  if (error) throw error;
}

/** Search runs here, on decrypted data, because the server cannot index blobs. */
export function searchItems(items: VaultItem[], query: string): VaultItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) =>
    [i.title, i.username, i.url, i.body, ...(i.tags ?? [])]
      .filter(Boolean)
      .some((f) => f!.toLowerCase().includes(q)),
  );
}

export type VaultBackup = {
  version: 1;
  generator: "a3zen-vault";
  exportedAt: string;
  items: ItemContent[];
};

export function exportVaultJson(items: VaultItem[]): string {
  const backup: VaultBackup = {
    version: 1,
    generator: "a3zen-vault",
    exportedAt: new Date().toISOString(),
    items: items.map((item) => ({
      type: item.type,
      title: item.title,
      username: item.username,
      password: item.password,
      url: item.url,
      body: item.body,
      tags: item.tags,
    })),
  };
  return JSON.stringify(backup, null, 2);
}

export async function importVaultItems(
  encKey: CryptoKey,
  imported: ItemContent[],
): Promise<VaultItem[]> {
  const MAX_IMPORT_ITEMS = 1000;
  const slice = imported.slice(0, MAX_IMPORT_ITEMS);
  const created: VaultItem[] = [];

  for (const item of slice) {
    if (!item || typeof item !== "object") continue;
    if (!item.title && !item.body && !item.password) continue;
    const res = await createItem(encKey, item);
    created.push(res);
  }
  return created;
}

