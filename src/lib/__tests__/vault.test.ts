import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exportVaultJson,
  searchItems,
  type VaultItem,
} from "../vault.ts";

const mockItems: VaultItem[] = [
  {
    id: "item-1",
    type: "login",
    title: "GitHub Personal",
    username: "alice",
    password: "secretpassword123",
    url: "https://github.com",
    tags: ["dev", "git"],
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
  {
    id: "item-2",
    type: "secret",
    title: "AWS Production API Key",
    body: "AKIAIOSFODNN7EXAMPLE",
    tags: ["cloud", "prod"],
    createdAt: "2026-01-02T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
  },
];

test("searchItems matches title, username, url, tags, and body", () => {
  assert.equal(searchItems(mockItems, "github").length, 1);
  assert.equal(searchItems(mockItems, "alice").length, 1);
  assert.equal(searchItems(mockItems, "AKIA").length, 1);
  assert.equal(searchItems(mockItems, "dev").length, 1);
  assert.equal(searchItems(mockItems, "prod").length, 1);
  assert.equal(searchItems(mockItems, "nonexistent").length, 0);
  assert.equal(searchItems(mockItems, "").length, 2);
});

test("exportVaultJson exports clean structured backup", () => {
  const json = exportVaultJson(mockItems);
  const parsed = JSON.parse(json);

  assert.equal(parsed.version, 1);
  assert.equal(parsed.generator, "a3zen-vault");
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.items[0].title, "GitHub Personal");
  assert.equal(parsed.items[1].title, "AWS Production API Key");
  // Ensure internal row database IDs are stripped for portability
  assert.equal(parsed.items[0].id, undefined);
});

test("sanitizeUrl permits valid http and https protocols", async () => {
  const { sanitizeUrl } = await import("../vault.ts");
  assert.equal(sanitizeUrl("https://example.com/login"), "https://example.com/login");
  assert.equal(sanitizeUrl("http://localhost:3000"), "http://localhost:3000/");
  assert.equal(sanitizeUrl("github.com/a3zen"), "https://github.com/a3zen");
});

test("sanitizeUrl blocks javascript, data, and malformed URI schemes", async () => {
  const { sanitizeUrl } = await import("../vault.ts");
  assert.equal(sanitizeUrl("javascript:alert(document.domain)"), null);
  assert.equal(sanitizeUrl("JAVASCRIPT:prompt(1)"), null);
  assert.equal(sanitizeUrl("data:text/html,<script>alert(1)</script>"), null);
  assert.equal(sanitizeUrl("vbscript:msgbox(1)"), null);
  assert.equal(sanitizeUrl("file:///etc/passwd"), null);
  assert.equal(sanitizeUrl(""), null);
  assert.equal(sanitizeUrl(undefined), null);
});

test("sanitizeItemContent clamps excessively large inputs", async () => {
  const { sanitizeItemContent } = await import("../vault.ts");
  const hugeTitle = "a".repeat(1000);
  const hugePassword = "b".repeat(60000);
  const clean = sanitizeItemContent({
    type: "login",
    title: hugeTitle,
    password: hugePassword,
  });

  assert.equal(clean.title.length, 500);
  assert.equal(clean.password?.length, 50000);
});

