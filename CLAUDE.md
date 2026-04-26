# CLAUDE.md — `yl-hb-ml` (Music Links enrichment)

Conventions shared across the `yl-hb-*` fleet live in
[`SCRAPER-CLAUDE-TEMPLATE.md`](../SCRAPER-CLAUDE-TEMPLATE.md) — read both.

## ⚠️ READ FIRST: SCHEMA MISMATCH WITH LIVE DB

The TypeScript scrapers in `src/` reference `talent_profiles`,
`social_profiles`, and `media_profiles`. **None of those tables exist
on the live Supabase project (`oerfmtjpwrefxuitsphl`)** — live uses
`hb_talent`, `hb_socials`, `hb_media`.

This repo is in the same broken state as `yl-hb-dtp`, `yl-hb-tadb`,
and `yl-hb-dz`. Treat the workflows as broken until rewritten or
retired.

## What this repo does (intent)

Three scheduled jobs that pull artist metadata from the **Music Links**
RapidAPI host:

1. **`musiclinks-enrichment`** — generic profile enrichment (followers,
   bio, etc.).
2. **`ml-social-enrichment`** — social-handle linking.
3. **`ml-media-enrichment`** — track/album rows.

There's also a nested `yl-hb-ml/` directory at the repo root (separate
from the parent `yl-hb-ml`) — looks like a bundled second copy. Audit
before relying on it.

## Stack

**Standard enrichment** variant: TypeScript via `ts-node`, service-role
Supabase, `dotenv`.

## Repo layout

```
src/
  ml-social-enrichment.ts            # primary entry for ml-social-enrichment.yml
  ml-media-enrichment.ts             # primary entry for ml-media-enrichment.yml
  musiclinks-enrichment.ts           # primary entry for musiclinks-enrichment.yml
  supabase.ts                        # service-role client
overnight-ml-social.sh               # local-runner wrapper
overnight-ml-media.sh                # local-runner wrapper
overnight-musiclinks.sh              # local-runner wrapper
yl-hb-ml/                            # ⚠️ nested duplicate dir — investigate before editing
.github/workflows/
  ml-social-enrichment.yml
  ml-media-enrichment.yml
  musiclinks-enrichment.yml
package.json
tsconfig.json
```

## Supabase auth

Standard fleet convention — `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`
in `src/supabase.ts`.

## Workflow lifecycle convention

All three workflows call `log_workflow_run` start + result. Hardcoded
GitHub workflow ids.

## Tables this repo intends to touch

| Legacy table | Operation | Live equivalent |
|---|---|---|
| `talent_profiles` | UPSERT | `public.hb_talent` |
| `social_profiles` | UPSERT | `public.hb_socials` |
| `media_profiles` | UPSERT | `public.hb_media` |
| `workflows` | RPC `log_workflow_run` | `public.workflows` (live, this works) |

## Running locally

```bash
npm install
cp .env.example .env.local            # if present
# Set: SUPABASE_URL, SUPABASE_SERVICE_KEY, RAPID_API_KEY, LIMIT
npx ts-node --transpile-only src/ml-social-enrichment.ts
```

> Env var name is `RAPID_API_KEY` (with underscore), not `RAPIDAPI_KEY`.
> Inconsistent with other fleet repos. Don't change it without
> coordinating with the GitHub repo secret.

## Per-repo gotchas

- **Schema mismatch (see top of file).**
- **Nested `yl-hb-ml/` directory at the repo root** — possibly a stale
  copy from a refactor. Don't blindly edit files inside it; audit
  whether it's referenced from any workflow first.
- **`RAPID_API_KEY` env var has the unusual underscore split.** All
  other fleet repos use `RAPIDAPI_KEY`. Keep this one in sync with the
  GitHub repo secret of the same name.

## Conventions Claude should follow when editing this repo

- **Don't run against `oerfmtjpwrefxuitsphl` until the schema rewrite.**
- **Don't rename `RAPID_API_KEY`** without simultaneously updating the
  GitHub Actions secrets for this repo.
- **Investigate the nested `yl-hb-ml/` directory** before assuming any
  file inside it is canonical.

## Related repos

- `yl-hb-tadb`, `yl-hb-dz`, `yl-hb-dtp` — same legacy-schema problem.
- `yl-hb-am`, `yl-hb-imdb`, `yl-hb-rgm`, `yl-hb-sp` — fleet-aligned
  models for the rewrite.
