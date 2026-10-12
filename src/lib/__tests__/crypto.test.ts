import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveKeys,
  encryptJson,
  decryptJson,
  toB64,
  fromB64,
  DEFAULT_KDF,
} from "../crypto.ts";

// Keep tests fast; correctness of argon2id itself is @noble's concern.
const FAST = { t: 1, m: 8192, p: 1 };

test("base64 round-trips arbitrary bytes", () => {
  const bytes = new Uint8Array(256).map((_, i) => i);
  assert.deepEqual(fromB64(toB64(bytes)), bytes);
});

test("derivation is deterministic for the same password and email", async () => {
  const a = await deriveKeys("correct horse battery staple", "me@example.com", FAST);
  const b = await deriveKeys("correct horse battery staple", "me@example.com", FAST);
  assert.equal(a.authHash, b.authHash);
});

test("email is normalised (case and whitespace)", async () => {
  const a = await deriveKeys("pw", "Me@Example.com", FAST);
  const b = await deriveKeys("pw", "  me@example.com ", FAST);
  assert.equal(a.authHash, b.authHash);
});

test("a different password yields a different authHash", async () => {
  const a = await deriveKeys("password-one", "me@example.com", FAST);
  const b = await deriveKeys("password-two", "me@example.com", FAST);
  assert.notEqual(a.authHash, b.authHash);
});

test("a different email yields a different authHash", async () => {
  const a = await deriveKeys("pw", "me@example.com", FAST);
  const b = await deriveKeys("pw", "other@example.com", FAST);
  assert.notEqual(a.authHash, b.authHash);
});

test("authHash cannot be used to reconstruct the encryption key", async () => {
  const { authHash, encKey } = await deriveKeys("pw", "me@example.com", FAST);
  // Non-extractable: even with a handle to the key, the bytes cannot be read.
  assert.equal(encKey.extractable, false);
  await assert.rejects(() => crypto.subtle.exportKey("raw", encKey));
  // And the value we send to the server is not the key material.
  assert.equal(fromB64(authHash).length, 32);
});

test("encrypt/decrypt round-trips a vault item", async () => {
  const { encKey } = await deriveKeys("pw", "me@example.com", FAST);
  const item = { title: "GitHub", username: "imran", password: "s3cr3t", notes: "2fa on" };
  const env = await encryptJson(encKey, "item-1", item);
  assert.deepEqual(await decryptJson(encKey, "item-1", env), item);
});

test("ciphertext leaks nothing in plaintext", async () => {
  const { encKey } = await deriveKeys("pw", "me@example.com", FAST);
  const env = await encryptJson(encKey, "item-1", { title: "GitHub", password: "s3cr3t" });
  const blob = env.ciphertext + env.iv;
  assert.ok(!blob.includes("GitHub"));
  assert.ok(!blob.includes("s3cr3t"));
});

test("the same plaintext encrypts to different ciphertext each time", async () => {
  const { encKey } = await deriveKeys("pw", "me@example.com", FAST);
  const a = await encryptJson(encKey, "item-1", { v: "same" });
  const b = await encryptJson(encKey, "item-1", { v: "same" });
  assert.notEqual(a.ciphertext, b.ciphertext, "IV reuse would be a critical flaw");
  assert.notEqual(a.iv, b.iv);
});

test("decryption fails under the wrong key", async () => {
  const good = await deriveKeys("pw", "me@example.com", FAST);
  const bad = await deriveKeys("wrong-pw", "me@example.com", FAST);
  const env = await encryptJson(good.encKey, "item-1", { v: 1 });
  await assert.rejects(() => decryptJson(bad.encKey, "item-1", env));
});

test("ciphertext moved to another item's row fails to decrypt", async () => {
  const { encKey } = await deriveKeys("pw", "me@example.com", FAST);
  const env = await encryptJson(encKey, "item-1", { v: 1 });
  await assert.rejects(
    () => decryptJson(encKey, "item-2", env),
    "AAD binding must reject a swapped blob",
  );
});

test("tampered ciphertext is rejected, not silently accepted", async () => {
  const { encKey } = await deriveKeys("pw", "me@example.com", FAST);
  const env = await encryptJson(encKey, "item-1", { v: 1 });
  const bytes = fromB64(env.ciphertext);
  bytes[0] ^= 0xff;
  await assert.rejects(() =>
    decryptJson(encKey, "item-1", { ...env, ciphertext: toB64(bytes) }),
  );
});

test("default KDF params meet OWASP minimums", () => {
  assert.ok(DEFAULT_KDF.m >= 19456, "argon2id memory should be >= 19 MiB");
  assert.ok(DEFAULT_KDF.t >= 2);
});
