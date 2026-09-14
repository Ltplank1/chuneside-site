# ChuneSide

ChuneSide is a curated music-discovery website built to put Wadadli artists first, spotlight selected Caribbean talent, and leave room for international and clearly labelled AI-assisted music.

This repository is the complete source for the current hosted ChuneSide baseline. The existing interface and behavior have been preserved for continued development.

## Technology stack

- React 19 and TypeScript
- Next.js 16 application structure compiled by Vinext
- Vite 8
- Cloudflare Worker runtime
- Cloudflare D1 (SQLite) for members, Likes, Follows, feature flags, artists, releases, review state, and media metadata
- Cloudflare R2 for private audio, artwork, and approved release-video storage
- Drizzle ORM and checked-in SQL migrations
- Tailwind CSS 4 plus the included UI component catalogue
- Supabase Auth for production email/password and Google sign-in, with the existing Sites sign-in fallback retained until Supabase is configured

## Prerequisites

- Node.js 22.13 or newer
- npm
- PowerShell or a Unix-like shell; the install, development, build, start, lint, and test commands are cross-platform Node wrappers

The dependency tree is locked by `package-lock.json`. Do not delete or regenerate it unless a dependency change requires that.

## Install

From the project root:

```bash
npm run install:ci
```

If dependencies are already present and match the lock file, no reinstall is necessary.

## Environment and database

The current source keeps the existing Sites sign-in flow until Supabase is configured. Copy `.env.example` to `.env.local` and add the Supabase Project URL and publishable key when you are ready to activate production ChuneSide authentication. Never add a Supabase service-role key, a Google client secret, or SMTP credentials to this project.

### Supabase production authentication setup

1. In Supabase, enable the Email provider and Google provider. Keep email confirmation enabled for production.
2. Add `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and a verified bootstrap email in `CHUNESIDE_ADMIN_EMAILS` to the hosted runtime configuration. Do not set `CHUNESIDE_ENABLE_LOCAL_AUTH=1` in production.
3. Set the Supabase Site URL to `https://chuneside.com` and add these redirect URLs: `https://chuneside.com/auth/callback`, `https://chuneside.com/auth/confirm`, and `https://chuneside.com/auth/update-password`. Add the equivalent local URLs only for local testing.
4. In the Supabase **Confirm signup** email template, replace `{{ .ConfirmationURL }}` with `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. This lets ChuneSide create the cookie-backed server session after email confirmation.
5. Configure Google’s authorized redirect URI in the Supabase Google provider settings. Keep Google’s client secret only in Supabase, not in this repository.

Before enabling the new production flow publicly, test email sign-up, email confirmation, password sign-in, password reset, Google sign-in, sign-out, and that an existing D1 member account retains its Member, Artist, Studio, or Admin permissions after signing in with the same verified email.

Run the non-secret preflight after adding runtime values and before a production deployment:

```bash
npm run preflight:production
```

The check verifies Supabase public configuration, the initial administrator allowlist, the production-only local-auth guard, Sites D1/R2 bindings, and the checked-in migration set. It does not print credentials.

The hosted database is declared in `.openai/hosting.json` as the logical D1 binding `DB`, and media storage is declared as the logical R2 binding `MEDIA`. Production supplies the real bindings automatically. Application code accesses them through `db/index.ts` and `lib/media-storage.ts`; do not hard-code a database, bucket identifier, or credential. Artist uploads are authorized by the server, streamed into private R2 objects, recorded in D1 by object key only, and delivered through controlled media routes after review approval. Supported release files are MP3/WAV/M4A/OGG audio (40 MB), JPG/PNG/WebP artwork (8 MB), and MP4/WebM/MOV video (100 MB).

The schema is in `db/schema.ts`. Checked-in migrations currently include:

```text
drizzle/0000_romantic_captain_flint.sql
drizzle/0001_feature_control_foundation.sql
drizzle/0002_account_controls_foundation.sql
drizzle/0003_artist_catalog_foundation.sql
drizzle/0004_release_review_foundation.sql
drizzle/0005_release_media_foundation.sql
drizzle/0006_community_announcements_foundation.sql
drizzle/0007_ai_upload_controls_foundation.sql
drizzle/0008_chuneside_stage_foundation.sql
```

After intentionally changing `db/schema.ts`, generate and inspect a new migration:

```bash
npm run db:generate
```

Never rewrite an already-applied production migration. Append a new migration instead.

## Run locally

```bash
npm run dev
```

Open the local address printed by Vite. Local development uses a simulated D1 binding. The public interface renders without authentication, but authenticated Like/Follow behavior depends on trusted Sites identity headers and is therefore fully exercised in the hosted Sites environment.

## Admin test path

You can test the public homepage immediately at the local Vite URL. The full upload-to-playback workflow is protected behind admin-test features and needs a signed-in admin account:

1. Visit `/admin/catalog`, seed the baseline catalogue, and link an artist profile to the signed-in admin or artist account.
2. Visit `/artist/dashboard`, submit release metadata, and upload an audio master plus cover artwork.
3. Visit `/admin/reviews`, approve the release after rights and AI disclosures are complete.
4. Return to `/`; the admin-test database catalogue can now show the approved release with real browser playback and cover art.

The scrolling Community News Bar can be tested from `/admin/announcements`. Add one or more enabled messages, then keep `community_news_bar` in `admin_test` for private verification or switch it to `on` only when the messages should be public.

AI upload controls can be tested from `/admin/ai-controls` after migration `0007` is applied. The default policy is one primarily AI-generated release per artist every 14 days, with Admin-configurable scope, limits, time period, override support, and artist-specific exceptions.

Linked artists can see their effective AI submission rule inside `/artist/dashboard`, including whether the global policy or an artist exception applies before submitting a release.

ChuneSide Stage management can be tested from `/admin/stage` after migration `0008` is applied. Stage records support draft-to-published review states, YouTube URL/ID capture, consent gating, flexible fee labels, home placements with optional active windows, and safe display on `/stage`, artist profiles, and the homepage Stage preview for consented published or featured performances. Admin Stage has search/status/placement filters, active/scheduled/expired homepage placement badges, row-level view/favorite metrics, and total Stage views; the public Stage page supports shareable `q`, `region`, and `genre` filters plus session-deduped view counting.

For local-only Admin API verification, start Vinext with a test allowlist and local auth enabled, then pass the documented `x-chuneside-local-*` headers. This fallback is ignored in production:

```bash
CHUNESIDE_ADMIN_EMAILS=codex-admin@chuneside.local CHUNESIDE_ENABLE_LOCAL_AUTH=1 npm run dev
```

Apply local D1 migrations with the checked-in local Wrangler config when a fresh `.wrangler` state is missing newer tables:

```bash
npx wrangler d1 execute DB --config wrangler.local.jsonc --local --file drizzle/0008_chuneside_stage_foundation.sql
```

After the local-auth server is running and migrations are applied, run the repeatable backend smoke test:

```bash
npm run smoke:local-admin
```

That smoke test covers anonymous Admin route redirects, Admin account setup, authorized Admin page rendering, account private-preview notes, catalogue seeding, announcement create/update/delete, AI global settings, artist-specific AI exceptions, Stage consent gating, Stage publishing, Stage archive/public hiding, Stage view counts, filtered browsing, artist media upload, pending-media privacy, review blocking before media, review approval after media, approved media public delivery, valid and invalid byte-range playback, release takedown and public-access removal, rejection note enforcement, rejected-release catalogue exclusion, rejected-media privacy, catalogue playback URLs, and AI upload-limit enforcement. The Review Queue also supports searching pending submissions by title, artist, genre, or region, plus discovery-lane and AI-classification filters.

The protected `/admin/audit` page provides a searchable, action- and entity-filtered view of the latest privileged changes, including release takedown reasons. Local smoke testing confirms a takedown event and reason appear there after the action.

The Audit Log is linked from each Admin workspace and included in the mobile protected-route smoke check. Mobile smoke also confirms the public region and sort controls render on the homepage.

Admin Catalogue supports searching artist and release records plus filtering releases by approval status.

Public discovery supports combined lane, genre, region, text, and sort controls so listeners can narrow and reorder the catalogue by place as well as sound. Genre and region choices adapt to the records currently returned by the catalogue, with a live matching-result count and clear-all action.

For mobile route-render checks against the running preview, use:

```bash
npm run smoke:mobile
```

Feature flags for `artist_workspace`, `artist_media_uploads`, `database_catalogue`, `community_news_bar`, `chuneside_stage`, `ai_music_category`, and `ai_upload_restriction` intentionally default to `admin_test`. Public visitors still see the safe demo catalogue and no announcement bar until those switches are moved to `on`.

## Build and test

Build the Cloudflare-compatible output:

```bash
npm run build
```

Run the available build and component checks:

```bash
npm test
```

The build step is cross-platform and works from Windows PowerShell or a Unix-like shell.

Optional lint check:

```bash
npm run lint
```

The lint step is also cross-platform and works from Windows PowerShell or a Unix-like shell.

The local development server is cross-platform as well: run `npm run dev` from Windows PowerShell or a Unix-like shell.

Database migration generation is cross-platform too: run `npm run db:generate` after a reviewed schema change.

Check Supabase Auth setup without printing credentials:

```bash
npm run auth:check
```

The generated `dist/` directory is disposable and intentionally excluded from the source package. Rebuild it from the checked-in source.

## Production deployment

The existing Sites project identity and logical bindings are preserved in `.openai/hosting.json`. When continuing inside Codex/ChatGPT Work:

1. Make and review source changes.
2. Run the relevant checks.
3. Use the Sites workflow to save a new source version for the existing project.
4. Deploy that saved version only when publication is intended.

Do not create a replacement Sites project; reuse the existing project ID. Do not commit short-lived repository credentials or runtime secrets.

The existing project is registered for `chuneside.com`. The domain will remain pending until its DNS provider contains the exact validation and apex records returned by the Sites domain setup. After DNS and TLS become active, configure the Supabase URLs above, run `npm run preflight:production`, deploy the verified version, then perform the authenticated launch QA.

For a future standalone GitHub/Cloudflare deployment outside Sites, the Worker entry point is `worker/index.ts`. That migration is not already configured here and will require an explicit Cloudflare project, D1 database binding, deployment configuration, and replacement authentication plan.

## Important project locations

- `app/page.tsx` — current complete client interface and interactions
- `app/globals.css` — ChuneSide visual design and responsive styles
- `app/api/member-state/route.ts` — authenticated member state, Likes, Follows, and chart totals
- `app/api/catalog/route.ts` — approved D1 catalogue responses with demo fallback
- `app/api/media/[id]/route.ts` — controlled R2 media delivery, including byte-range audio playback
- `app/admin/catalog/` — protected artist and release management
- `app/admin/reviews/` — protected human review queue
- `app/admin/announcements/` — protected scrolling news-bar management
- `app/admin/ai-controls/` — protected AI upload policy, exceptions, and submission history
- `app/admin/stage/` — protected ChuneSide Stage performance, consent, YouTube embed, and placement management
- `app/stage/` — public ChuneSide Stage destination, gated by the `chuneside_stage` feature flag
- `app/api/stage/` — public Stage performance feed for the Stage page and homepage preview
- `app/artist/dashboard/` — linked-artist submission and media upload workspace
- `app/chatgpt-auth.ts` — Sites/ChatGPT sign-in helpers
- `db/schema.ts` — D1 tables and indexes
- `drizzle/` — database migration and Drizzle metadata
- `public/` — ChuneSide logos, hero artwork, hero video, and icons
- `worker/index.ts` — Cloudflare Worker entry point
- `.openai/hosting.json` — existing Sites project identity and logical bindings
- `wrangler.local.jsonc` — local-only D1/R2 binding config for applying migrations and smoke-testing Admin APIs
- `CODEX_HANDOFF.md` — architecture, decisions, implemented features, and honest unfinished-feature inventory

Admin Accounts includes private-preview roster filters for role, status, and readiness groups so test admins, active artists, verified artists, restricted accounts, and founding testers can be reviewed before wider access. Each account row also exposes an audited private-preview note for recording readiness, blockers, or follow-up context.

## Security notes

- No passwords, OAuth secrets, API keys, service-role keys, or database credentials are included.
- Member identity is taken only from trusted server request headers supplied by Sites.
- Anonymous requests cannot mutate Likes or Follows.
- One Like per member/track and one Follow per member/artist are enforced by composite database primary keys.
- Production authentication uses Supabase’s cookie-backed Email/Password and Google OAuth flows when its public configuration is present. The existing Sites/local fallback remains available while it is absent.

## Reference prototype

The transfer ZIP also contains `reference/offline-test-studio/`, a separate browser-only prototype created during earlier feature exploration. It is included for design and feature reference only. The production baseline is the project at the ZIP root.
