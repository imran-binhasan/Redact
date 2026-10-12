"use client";

import { useState } from "react";

const SCHEMA_SQL = `-- Vault storage: Zero-knowledge client-side encrypted
create table public.vault_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  ciphertext  text not null,
  iv          text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index vault_items_user_updated_idx
  on public.vault_items (user_id, updated_at desc);

alter table public.vault_items enable row level security;

create policy "read own items" on public.vault_items
  for select to authenticated using ((select auth.uid()) = user_id);

create policy "create own items" on public.vault_items
  for insert to authenticated with check ((select auth.uid()) = user_id);

create policy "update own items" on public.vault_items
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "delete own items" on public.vault_items
  for delete to authenticated using ((select auth.uid()) = user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.user_id := old.user_id;
  return new;
end;
$$;

create trigger vault_items_touch_updated_at
  before update on public.vault_items
  for each row execute function public.touch_updated_at();

revoke all on public.vault_items from anon;`;

export function DeployGuide({ onClose }: { onClose?: () => void }) {
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);

  async function copySql() {
    await navigator.clipboard.writeText(SCHEMA_SQL);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  }

  async function copyEnvSnippet() {
    const snippet = `NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co\nNEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key`;
    await navigator.clipboard.writeText(snippet);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2500);
  }

  return (
    <div className="p-6 sm:p-8 max-w-2xl space-y-6">
      <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <h2 className="text-xl tracking-tight font-medium">Easy Deploy & Self-Host Guide</h2>
          <p className="mt-1 text-sm text-muted">
            Host your own zero-knowledge vault for free with 0 server maintenance.
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-xs px-2.5 py-1.5 rounded bg-surface border border-line text-muted hover:text-text transition-colors"
          >
            Close
          </button>
        )}
      </div>

      {/* 1-Click Deploy Banner */}
      <div className="p-4 rounded-lg bg-surface border border-line space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-medium text-text">1-Click Vercel Deployment</h3>
            <p className="text-xs text-muted mt-0.5">
              Deploy frontend directly to Vercel Edge with zero configuration.
            </p>
          </div>
          <a
            href="https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fa3zen%2Fredact&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY&project-name=a3zen-redact"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#ffffff] text-[#000000] text-xs font-semibold hover:bg-neutral-200 transition-colors shadow-sm"
          >
            <span>▲ Deploy to Vercel</span>
          </a>
        </div>
      </div>

      {/* Step by step checklist */}
      <div className="space-y-4 text-sm">
        <h3 className="font-medium text-text">3-Step Free Setup</h3>

        {/* Step 1 */}
        <div className="p-4 rounded-lg bg-surface/60 border border-line space-y-2">
          <div className="flex items-center gap-2 text-brass text-xs font-mono uppercase tracking-wider">
            <span>Step 1</span>
          </div>
          <h4 className="font-medium">Create a free Supabase Project</h4>
          <p className="text-xs text-muted leading-relaxed">
            Head to{" "}
            <a
              href="https://supabase.com"
              target="_blank"
              rel="noreferrer"
              className="text-brass underline hover:text-[#d8b45c]"
            >
              supabase.com
            </a>{" "}
            and create a new project. The free tier includes 500MB storage and 50,000 monthly users.
          </p>
        </div>

        {/* Step 2 */}
        <div className="p-4 rounded-lg bg-surface/60 border border-line space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-brass text-xs font-mono uppercase tracking-wider">Step 2</span>
            <button
              onClick={copySql}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                copiedSql
                  ? "bg-brass text-ink border-brass font-medium"
                  : "bg-surface border-line text-muted hover:text-text"
              }`}
            >
              {copiedSql ? "✓ SQL Copied!" : "Copy SQL Schema"}
            </button>
          </div>
          <h4 className="font-medium">Run the SQL Migration</h4>
          <p className="text-xs text-muted leading-relaxed">
            Open the <strong>SQL Editor</strong> in your Supabase dashboard and run the schema to
            create the table and Row Level Security policies.
          </p>
          <pre className="text-[11px] font-mono bg-ink/70 p-3 rounded border border-line/60 overflow-x-auto text-muted/80 max-h-36">
            {SCHEMA_SQL}
          </pre>
        </div>

        {/* Step 3 */}
        <div className="p-4 rounded-lg bg-surface/60 border border-line space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-brass text-xs font-mono uppercase tracking-wider">Step 3</span>
            <button
              onClick={copyEnvSnippet}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                copiedEnv
                  ? "bg-brass text-ink border-brass font-medium"
                  : "bg-surface border-line text-muted hover:text-text"
              }`}
            >
              {copiedEnv ? "✓ Copied Env!" : "Copy Env Template"}
            </button>
          </div>
          <h4 className="font-medium">Set Environment Variables</h4>
          <p className="text-xs text-muted leading-relaxed">
            Under <strong>Project Settings → API</strong>, copy your Project URL and anon key into
            Vercel Environment Variables or your local <code>.env.local</code>.
          </p>
          <div className="bg-ink/70 p-2.5 rounded border border-line/60 font-mono text-xs text-muted">
            <div>NEXT_PUBLIC_SUPABASE_URL=https://...supabase.co</div>
            <div>NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...</div>
          </div>
        </div>
      </div>
    </div>
  );
}
