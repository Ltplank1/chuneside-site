# ChuneSide Changelog

## 2026-09-10

- Added a Supabase Auth foundation with cookie-backed SSR clients, email/password sign-up and sign-in, Google OAuth entry, PKCE callback handling, Supabase-first identity resolution, and a fallback to the existing Sites/local sign-in flow when Supabase is not configured.
- Preserved existing ChuneSide roles across Supabase sign-in by resolving a verified Supabase email to its existing D1 member record before role-sensitive actions run.
- Added a secure Supabase email-confirmation endpoint that verifies a token hash server-side and establishes the matching cookie-backed session, plus friendly callback and confirmation errors.
- Added password-recovery and password-update screens that reuse the secure PKCE callback and avoid account-enumeration responses.
- Added request-level Supabase session refresh through the framework proxy, guarded so the existing local and Sites authentication paths are unchanged until Supabase is configured.
- Added password confirmation checks to Supabase sign-up and password recovery forms.
- Made Supabase-to-D1 member matching case-insensitive for verified email addresses, preserving existing roles when email casing differs.
- Replaced the remaining Bash-only install and start commands with cross-platform Node wrappers for Windows PowerShell and Unix-like shells.
- Marked Supabase callback, confirmation, and sign-out redirects as private and non-cacheable.
- Added graceful provider-error handling for Supabase callback, confirmation, and sign-out routes.
- Added direct legacy sign-in buttons to the Supabase sign-up and recovery fallback screens.
- Added a clear callback state for canceled or failed Google OAuth attempts.
- Fixed the Windows Sites environment launcher so it can run Node-based setup commands with `shell: false`.
- Added `npm run auth:check` to validate Supabase public configuration without exposing keys.
- Made Supabase session refresh fail open for public page delivery during temporary provider outages.
- Added genre-filtered views to the verified monthly and all-time member charts.
- Added genre-filtered views to the verified monthly and all-time member charts.

## 2026-09-09

- Replaced the Bash-only production build entrypoint with a cross-platform Node wrapper so `npm test` runs on Windows as well as Unix-like environments.
- Replaced the Bash-only lint environment entrypoint with a cross-platform Node wrapper so `npm run lint` runs on Windows as well as Unix-like environments.
- Added shareable individual ChuneSide Stage performance pages with consented public visibility, YouTube playback, artist links, setlists, metadata, share controls, and session-deduped view tracking.
- Connected Stage previews on the homepage and artist profiles to their individual performance pages.
- Added public Stage highlight sections for featured, latest, most watched, Wadadli, and Caribbean performances, with empty sections omitted automatically.
- Added an Admin Stage analytics summary for public share, top public region, and configured placement mix.
- Replaced the Unix-only local development command with a cross-platform Node launcher so `npm run dev` works on Windows.
- Replaced the Unix-only database migration command with the cross-platform Sites environment launcher.

## 2026-09-07

- Added the Feature Control foundation with database-backed feature flags, a protected Admin screen, and audit logging.
- Added account roles, account status, artist verification status, founding artist/studio flags, and monetization status to the member model.
- Added a protected Admin Accounts screen for searching accounts and updating role/status readiness fields.
- Updated Admin authorization so access can come from either the owner email allowlist or an active database `admin` role.
- Added durable artist profile and release models with approval, explicit-content, AI disclosure, discovery-lane, and download-readiness fields.
- Added a protected Admin Catalogue screen and a repeatable seed action for moving the eight existing demo tracks into D1 without changing the public homepage yet.
- Added a guarded public catalogue endpoint and connected Discovery to approved D1 releases for admin testing, with automatic fallback to the existing eight-track demo feed.
- Added public, shareable artist profile pages with artist-specific metadata, verification/founding labels, approved releases, and Discovery links.
- Added protected, validated Admin editors for creating and updating artist profiles and releases, with automatic public track numbering and audit records.
- Added profile ownership assignment and a feature-gated Artist Dashboard where active linked artists can submit release metadata into the approval queue.
- Added release rights confirmation, AI-use disclosure, submission notes, and reviewer decision metadata.
- Added a protected Admin Review Queue with guarded approvals, required rejection notes, artist-facing feedback, and audit records.
- Added admin-test-only R2 audio and cover uploads with D1 ownership metadata, signature and size validation, private review previews, replacement handling, and publication during approval.
- Connected approved audio and cover URLs to public catalogue responses, real browser playback, volume/seeking controls, and R2 byte-range delivery while preserving explicit preview mode for demo records.
- Added the Community News Bar foundation with database-backed announcements, protected Admin management, public feature-flag gating, active-date filtering, ordering, pause/delete controls, and mobile-friendly scrolling display.
- Added admin-test Feature Control entries for ChuneSide Stage, AI music category, AI music upload restriction, Fan Choice, rankings settings, favorites/library, DJ profiles, and the scrolling Community News Bar.
- Added the AI music upload-control foundation with human-created, AI-assisted, primarily AI-generated, and classification-pending release classifications; configurable global limits; artist-specific exceptions; durable submission history; and server-side artist submission enforcement.
- Added artist-facing AI submission policy summaries to the Artist Dashboard using the effective global or artist-specific rule.
- Added the ChuneSide Stage foundation with durable performance records, protected Admin controls, YouTube URL/ID handling, required consent before approval/publication, flexible fee labels, placement metadata, archive flow, a public `/stage` destination, and safe artist-profile display for published or featured performances.
- Added a public Stage feed and homepage Stage preview that surfaces consented published or featured performances when the `chuneside_stage` feature flag is available.
- Added shareable public ChuneSide Stage browsing filters for search, region, and genre.
- Connected Stage home placement and feature-window fields to public feed ordering and the homepage Stage preview.
- Added Admin Stage placement badges and an active-home-placement summary tile.
- Added a public Stage view-count endpoint and session-deduped browser tracker for visible Stage performance cards.
- Added Admin Stage total view and per-performance view/favorite metric display.
- Added Admin Stage list filtering by search, status, home-placement state, and sort mode.
- Added a repeatable mobile smoke check for homepage, Stage, artist profile, Artist Dashboard auth, and Admin auth route rendering.
- Added private-preview roster filters and readiness badges to Admin Accounts for choosing admin and artist test users.
- Added audited private-preview notes to Admin Accounts and local smoke coverage for note persistence.
- Expanded local Admin smoke coverage for artist media upload, review blocking before media, review approval after media, and approved catalogue playback URLs.
- Expanded local Admin smoke coverage for review rejection notes, rejected-release catalogue exclusion, and private media access on rejected releases.
- Added a local-only Admin/API testing path with explicit opt-in local auth headers, a matching local Wrangler config, and repeatable smoke coverage for Admin catalogue, announcement create/update/delete, AI global settings and artist exceptions, Stage publishing consent, Stage archive/public hiding, and AI upload-limit enforcement.
- Kept public money, upload, payout, playlist, AI, and DJ-mix features disabled until their legal, payment, and product requirements are ready.
- Added Review Queue search plus discovery-lane and AI-classification filters for faster Admin triage.
- Expanded local Admin smoke coverage to render-check authorized Accounts, Review Queue, AI Music Controls, and Stage Management pages.
- Expanded local Admin smoke coverage to verify anonymous redirects for all protected Admin routes.
- Expanded local Admin smoke coverage to verify anonymous users cannot access media while a release is pending review.
- Expanded local Admin smoke coverage to verify pending release media remains private until approval.
- Expanded local Admin smoke coverage to verify approved audio and cover media are publicly delivered with the correct content types.
- Expanded local Admin smoke coverage to verify approved audio supports HTTP byte-range playback for seeking.
- Expanded local Admin smoke coverage to verify invalid audio ranges return `416` with the required `Content-Range` header.
- Added a protected Admin release takedown action requiring a reason, disabling the release, removing public media URLs, and revoking media delivery with an audit record.
- Added a protected, searchable Admin Audit Log for reviewing recent privileged changes and takedown reasons.
- Added Audit Log navigation across Admin workspaces and mobile auth-gate coverage for the new route.
- Expanded local Admin smoke coverage to verify release takedown events and reasons appear in the Audit Log.
- Added Audit Log entity-type filtering alongside action filtering for faster Admin investigation.
- Expanded local Admin smoke coverage to verify the API rejects release takedowns without a reason.
- Added responsive Admin Catalogue search and release approval-status filtering.
- Added a public catalogue region selector that works alongside lane, genre, and text discovery filters.
- Made public catalogue genre and region filter options adapt to live catalogue records while preserving the preferred discovery order.
- Added public catalogue sorting for curated order, newest additions, and title A-Z.
- Added a live public catalogue result count for the active discovery filters.
- Added a public discovery "Clear all" action that resets text, lane, genre, region, and sort selections together.
- Expanded mobile smoke coverage to confirm public catalogue region and sort controls render on the homepage.
