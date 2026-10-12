# Redact

A lightweight, zero-knowledge personal vault by **a3zen** for notes, passwords and API keys. Encrypted in the browser before anything is stored, so the server holds sealed blocks it cannot open.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fa3zen%2Fredact&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY&project-name=a3zen-redact)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

### Key Features
- **Zero-Knowledge Architecture:** Master password and decryption keys never reach the server.
- **Blind Server:** All metadata (title, URL, username, notes, tags) is sealed inside AES-256-GCM ciphertext. The database cannot tell a password from a note.
- **Serverless & Self-Hosted:** No Docker containers, Redis, or OS maintenance. Connects directly to a free Supabase project.
- **Vim-style Keyboard Navigation:** Search (`/`), move (`j`/`k`), create (`n`), and copy (`c`).
- **Data Portability:** Built-in Decrypted JSON Export and Backup Import.
- **Auto-Clearing Clipboard & Idle Lock:** Clears sensitive clipboard data in 20s and auto-locks on inactivity.
- **Built-in 2FA (TOTP):** Multi-factor authentication via any standard authenticator app.

## How the encryption works

```
master password ──argon2id(salt = sha256("a3zen-vault|v1|" + email))──> masterKey
                                                    │
                        ┌───────────────────────────┴──────────────────────────┐
                 hkdf("a3zen:auth:v1")                          hkdf("a3zen:enc:v1")
                        │                                                      │
                    authHash                                                encKey
          sent to Supabase as the account                    AES-256-GCM, non-extractable,
          password; cannot decrypt anything                   held in memory for one tab
```

- **Argon2id**, 64 MiB / 3 passes / 4 lanes (~2s), from `@noble/hashes`.
- **AES-256-GCM** per item, random 96-bit IV each save, with the item's `id`
  bound in as additional authenticated data — a compromised server cannot move
  one item's ciphertext onto another item's row without decryption failing.
- The KDF salt is derived from your email rather than stored server-side. A
  stored salt would need an unauthenticated "what is the salt for this address"
  endpoint, which reveals which addresses have accounts.
- Item **type, title, username, URL, body and tags all live inside the
  ciphertext**. The `vault_items` table has no columns for them, so the server
  cannot tell a note from a password, or count how many of each you hold.
- Search runs in the browser on decrypted data, because the server has nothing
  it can index.

**There is no password reset.** The master password never reaches the server in
a recoverable form, so nobody can reset it and nobody can recover your data
without it. Write it down somewhere physical.

## Deployment & Setup

### Option 1: 1-Click Cloud Deploy (Recommended)
1. Click the **Deploy with Vercel** button above.
2. Create a free project at [supabase.com](https://supabase.com).
3. Paste the contents of `supabase/migrations/0001_vault.sql` into the Supabase **SQL Editor** and run it.
4. In your Supabase dashboard (**Project Settings → API**), copy:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Supply those two variables in the Vercel deployment form.
6. Under Supabase **Authentication → Providers → Email**, turn *Confirm email* on.

### Option 2: Local / Self-Hosted Setup
1. Clone this repository:
   ```sh
   git clone https://github.com/a3zen/vault.git && cd vault
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Set up a free project on [supabase.com](https://supabase.com) and run `supabase/migrations/0001_vault.sql` in the SQL editor.
4. Copy the API credentials:
   ```sh
   cp .env.local.example .env.local
   ```
   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
5. In **Authentication → Providers → Email**, turn *Confirm email* on.
6. Run the development server:
   ```sh
   npm run dev
   ```
7. Open <http://localhost:3000> and choose *Set up a new vault*.

## Backup & Data Portability

Because this vault uses zero-knowledge encryption and **cannot reset your master password**, backing up your credentials is straightforward:
- Inside the vault, navigate to **Settings → Backup & Export**.
- **Export Decrypted JSON:** Downloads all items into a clear JSON document for migration or offline archives.
- **Import Backup:** Restore or migrate items from any JSON backup with automatic client-side encryption.

## Keyboard Navigation

| Key | Action |
|---|---|
| `/` | Focus search |
| `j` / `k` | Move through items list |
| `n` | Create new item |
| `c` | Copy selected password/secret |
| `Esc` | Clear selection / Lock vault |

The vault locks automatically after 5 minutes of inactivity. When a password is copied, the clipboard is wiped after 20 seconds while the browser tab has focus.

## Commands

```sh
npm run dev     # development server
npm run build   # production build
npm test        # crypto tests (node:test)
npm run lint
```

The tests in `src/lib/__tests__/crypto.test.ts` cover the properties that must
hold: derivation is deterministic, the IV never repeats, ciphertext leaks no
plaintext, the auth hash cannot reconstruct the key, and tampered or relocated
ciphertext is rejected rather than silently accepted.

## What this does not protect against

Worth being clear, because a vault that overstates its guarantees is worse than
one that doesn't.

- **A compromised browser or device.** While the vault is unlocked the key is in
  memory. Malware or a malicious extension with access to the page can read it.
  This is true of every web vault, including the commercial ones.
- **Script injected into this app.** Same reason. The CSP in `next.config.ts`
  blocks external script and restricts `connect-src` to Supabase to limit what
  an injection could do, but it is mitigation, not immunity. Be careful about
  adding dependencies that run at render time.
- **A weak master password.** Argon2id makes guessing expensive, not
  impossible. Use a long passphrase you don't use anywhere else.
- **Metadata.** Row counts and created/updated timestamps are visible to the
  server. Contents are not.
- **Email-derived salt trade-off.** The KDF salt is derived from your email rather
  than stored server-side to prevent unauthenticated user enumeration. An adversary
  who already knows your email can generate a targeted rainbow table for that specific
  address's Argon2id salt, so use a high-entropy passphrase.
- **Clipboard wiping bounds.** The 20-second clipboard wipe relies on `document.hasFocus()`
  because modern browser sandbox APIs forbid background tabs from modifying the
  OS clipboard. If you switch to another desktop app before 20s, clear the clipboard manually.
- **Loss.** There is no recovery path by design. Export and back up anything you
  cannot afford to lose.

Two-factor login guards the Supabase account — it stops someone who has your
master password from signing in, but the master password is still the only thing
that can decrypt what's inside.

## License

Distributed under the [MIT License](LICENSE). Free and open-source.

