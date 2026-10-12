/**
 * Zero-knowledge crypto core.
 *
 * Everything in this file runs in the browser. The master password and the
 * encryption key derived from it never leave the device, and are never sent to
 * Supabase in any form. The server only ever receives `authHash`, which cannot
 * decrypt anything.
 *
 *   password ──argon2id──> masterKey ──hkdf("auth")──> authHash  → Supabase Auth
 *                              └───────hkdf("enc")───> encKey    → stays in memory
 */
import { argon2idAsync } from "@noble/hashes/argon2.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

export type KdfParams = {
  /** iterations */
  t: number;
  /** memory in KiB */
  m: number;
  /** parallelism */
  p: number;
};

/** ~2s on a modern laptop. Stored per-user so these can be raised later. */
export const DEFAULT_KDF: KdfParams = { t: 3, m: 65536, p: 4 };

const KEY_LEN = 32;
const IV_LEN = 12;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function fromB64(s: string): Uint8Array {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * The KDF salt is derived from the email rather than stored server-side. A
 * stored random salt would need an unauthenticated "fetch salt for this email"
 * endpoint, which leaks which emails have accounts.
 */
function kdfSalt(email: string): Uint8Array {
  return sha256(enc.encode(`a3zen-vault|v1|${email.trim().toLowerCase()}`));
}

export type DerivedKeys = {
  /** Sent to Supabase as the account password. Useless for decryption. */
  authHash: string;
  /** Non-extractable AES-GCM key. Lives in memory only, cleared on lock. */
  encKey: CryptoKey;
};

export async function deriveKeys(
  password: string,
  email: string,
  params: KdfParams = DEFAULT_KDF,
): Promise<DerivedKeys> {
  const masterKey = await argon2idAsync(enc.encode(password), kdfSalt(email), {
    ...params,
    dkLen: KEY_LEN,
    asyncTick: 10, // yield to the event loop so the UI keeps painting
  });

  const authBytes = hkdf(sha256, masterKey, undefined, enc.encode("a3zen:auth:v1"), KEY_LEN);
  const encBytes = hkdf(sha256, masterKey, undefined, enc.encode("a3zen:enc:v1"), KEY_LEN);
  masterKey.fill(0);

  const encKey = await crypto.subtle.importKey(
    "raw",
    encBytes as BufferSource,
    "AES-GCM",
    false, // non-extractable: cannot be serialised back out of the browser
    ["encrypt", "decrypt"],
  );
  encBytes.fill(0);

  return { authHash: toB64(authBytes), encKey };
}

export type Envelope = { ciphertext: string; iv: string };

/**
 * `itemId` is bound in as additional authenticated data, so a compromised
 * server cannot swap one item's ciphertext onto another item's row.
 */
export async function encryptJson(
  encKey: CryptoKey,
  itemId: string,
  value: unknown,
): Promise<Envelope> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const buf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(itemId) },
    encKey,
    enc.encode(JSON.stringify(value)),
  );
  return { ciphertext: toB64(new Uint8Array(buf)), iv: toB64(iv) };
}

export async function decryptJson<T>(
  encKey: CryptoKey,
  itemId: string,
  envelope: Envelope,
): Promise<T> {
  const buf = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromB64(envelope.iv) as BufferSource,
      additionalData: enc.encode(itemId),
    },
    encKey,
    fromB64(envelope.ciphertext) as BufferSource,
  );
  return JSON.parse(dec.decode(buf)) as T;
}
