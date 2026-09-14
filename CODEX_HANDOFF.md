# ChuneSide Codex Handoff

## Purpose of this handoff

This is the source for the current hosted ChuneSide website, preserved as the baseline for continued development. Do not replace the interface with a starter template or assume that discussed roadmap ideas already exist in production.

Baseline before handoff documentation: Git commit `634353e` (`Add verified member rankings and unique likes`). The Sites project currently identifies itself as ChuneSide and uses the existing project ID in `.openai/hosting.json`.

## Product direction

ChuneSide is a curated music platform for discovering upcoming artists:

- Wadadli/Antigua and Barbuda leads the platform.
- A selected Caribbean lane widens discovery.
- Exceptional independent music from the wider world may be included.
- AI-assisted music has a clearly labelled lane and requires disclosure.
- Guests may listen; signed-in members shape Likes and Follows.
- Every public submission is intended to receive rights and safety review.
- Monetization should use tasteful sponsorship, supported premieres, contest partners, and later fan support—not disruptive mid-song advertising.

## Current architecture

### Frontend

- `app/page.tsx` is a client component containing the present single-page experience and its local interaction state.
- `app/globals.css` owns the visual language: dark cinematic surfaces, acid-green highlights, violet/pink gradients, responsive grids, horizontal mobile navigation, and fixed now-playing controls.
- Reusable UI primitives live under `components/ui/`.
- Public brand/media assets live under `public/`.

### Server/backend

- The application is compiled by Vinext and served from the Cloudflare Worker entry point in `worker/index.ts`.
- ChuneSide-specific API routes now cover member state, public catalogue reads, admin feature/account/catalog/review controls, artist release submissions, and controlled media upload/delivery.
- `db/index.ts` obtains the injected D1 `DB` binding and constructs the Drizzle client.
- `lib/media-storage.ts` obtains the injected R2 `MEDIA` binding for private upload storage and controlled review/public delivery.
- `.openai/hosting.json` preserves the existing Sites identity and declares D1 as `DB` and R2 as `MEDIA`.

### Authentication

- Supabase Auth is now the preferred production authentication system when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are configured. It supports email/password sign-up and sign-in, confirmation-link session exchange, and Google OAuth.
- The existing Sites-managed Sign in with ChatGPT (SIWC) flow remains the fallback when Supabase is not configured, so local/admin testing continues to work during the production authentication rollout.
- The dispatcher owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, and `/callback`.
- Server code trusts only the injected headers `oai-authenticated-user-id`, `oai-authenticated-user-email`, and the optional encoded full-name headers.
- Local-only Admin/API testing can use `x-chuneside-local-user-id`, `x-chuneside-local-user-email`, and `x-chuneside-local-user-full-name` only when `CHUNESIDE_ENABLE_LOCAL_AUTH=1` and the runtime is not production. Sites headers always take precedence.
- `app/auth/` contains the Supabase sign-in, sign-up, callback, sign-out, and confirmation routes. `lib/supabase/` owns browser and cookie-backed server clients, while `proxy.ts` refreshes Supabase sessions on matched requests.
- `app/chatgpt-auth.ts` retains the existing Sites helper API and now resolves Supabase users first, with a safe fallback to the SIWC flow.
- The homepage links directly to the dispatcher-owned sign-in/sign-out routes with top-level navigation.
- A member row is upserted into D1 when an authenticated user performs a Like or Follow action. Supabase users first reuse an existing member record by ID or case-insensitive verified email so existing roles and artist ownership remain intact.

### Database

The D1 schema includes:

- `members`, with stable Sites user IDs, email/display data, account roles, account status, artist verification fields, founding flags, monetization state, and moderation notes.
- `song_likes` and `artist_follows`, with one active Like per member/song and one Follow per member/artist.
- `feature_flags`, for independently switching major product modules between off, admin test, and on.
- `admin_audit_logs`, for privileged feature/account/catalog/review changes.
- `artist_profiles`, for durable artist identity, ownership, verification, visibility, biography, and social/profile media.
- `releases`, for durable track metadata, approval status, rights confirmation, AI disclosure, review notes, publication timestamps, and approved media IDs.
- `release_media`, for uploaded audio/cover metadata linked to private R2 objects.
- `community_announcements`, for the scrolling Community News Bar messages, category, enabled/paused state, display order, speed, text size, font style, active date window, and audit attribution.
- `ai_upload_settings`, `ai_artist_exceptions`, and `ai_submission_history`, for configurable AI submission limits, artist-specific overrides, and durable history that survives release deletion/replacement.
- `stage_performances`, for ChuneSide Stage performance records, YouTube embeds, artist consent, review/scheduling/publication status, home placement metadata, flexible fee labels, and archive state.

The initial schema migration and Drizzle metadata are checked into `drizzle/`.

## Implemented and working in the hosted baseline

- Premium responsive ChuneSide homepage and supplied logo integration.
- Cinematic looping hero video, three feature selectors, and hero messaging.
- Eight realistic sample releases organized into Wadadli, Caribbean, AI-assisted, and World lanes.
- Text search and genre/lane filtering over the sample catalogue.
- Simulated now-playing UI with play/pause, previous/next, progress, and volume controls.
- Video/artist spotlight presentation concepts.
- Dedicated AI-assisted music explanation and disclosure position.
- Database-backed Community News Bar foundation with Admin-managed announcements, date windows, pause/delete controls, ordering, speed, font style, and public/admin-test feature gating.
- AI upload-control foundation with Admin-configurable limits, artist exceptions, four release classifications, and backend enforcement during artist submission.
- Artist Dashboard AI submission policy panel showing the effective global or artist-specific AI limit before release submission.
- ChuneSide Stage foundation with Admin performance management, search/status/placement filtering, YouTube URL/ID parsing, consent gating before approval/publication, flexible fee labeling, archive flow, Admin active/scheduled/expired placement badges plus row/summary view metrics, public `/stage` destination with shareable search/region/genre filters and session-deduped view counting, public Stage feed with active home-placement windows, homepage preview, and consented published/featured artist-profile display.
- Admin Stage reach panel ranking public performances by recorded views with relative reach bars and favorite-rate summaries.
- Shareable public Stage directory sorting for curated placement order, newest performances, or most watched.
- Discovery search, lane, genre, region, and sort settings are shareable URL state, so filtered catalogue links can be revisited without relying on browser-local state.
- Discovery genre and region options are derived from the current approved catalogue rather than a hard-coded sample list, keeping live filtering and visible counts aligned with production data.
- When the database catalogue feature is enabled, an empty approved catalogue now renders as an intentional empty state rather than falling back to sample releases; the homepage player remains safe while live releases are being prepared.
- Artist workspace Stage submissions for linked profiles, with a validated YouTube source, explicit publication consent, private `submitted` status, audit logging, and an Admin-managed review/publishing handoff.
- Artist correction and resubmission workflow for rejected Stage performances: the linked artist can update a rejected record and return it only to private `submitted` review, with homepage placement and fee settings reset for Admin control.
- Stage rejection decisions require an Admin correction note. The note is preserved in the audit history and visible only in the linked artist or studio workspace while that performance remains rejected.
- Controlled artist profile-photo and cover-image uploads backed by private R2 objects, with ownership checks, audit events, cache-busted public delivery, and external admin URL compatibility.
- Public artist profiles play approved uploaded audio directly from the artist release list, with play/pause state and uploaded cover artwork; demo releases still route listeners to the Discovery player.
- Artist self-serve profile editing for biography, country/region, genre, and social links, with administrator-controlled ownership, visibility, name, and verification fields.
- Active Studio accounts can use the Artist & Studio workspace for the profiles explicitly linked to them; the existing per-profile ownership checks remain in force, and Admin catalogue assignment accepts only active Artist, Studio, or Admin accounts.
- The local Admin smoke workflow creates an independent Studio account and linked profile, verifies the Studio workspace renders only that linked profile, and restores the prior workspace feature-flag state afterward.
- Installable PWA foundation with manifest metadata and a conservative offline shell cache that excludes auth, admin, workspace, API, and media requests.
- Context-aware PWA install prompt that appears only when supported, supports dismissal, and hides after installation.
- Repeatable mobile route-render smoke coverage for homepage, `/stage`, `/artists/nia-vale`, Artist Dashboard auth, and Admin auth gates.
- Admin Accounts private-preview roster filters and readiness badges for active admins, active artists, verified artists, restricted accounts, and founding testers.
- Audited Admin Accounts private-preview notes for recording readiness, blockers, or follow-up context per test user.
- Controlled Admin release reinstatement: disabled releases can return only to private pending review with an audit note, cleared public media, and a requirement for fresh media before later human approval.
- Artist correction and resubmission workflow for rejected releases: only the linked artist can update the rejected record, after which it returns to private pending review with its prior decision cleared and an audit event recorded.
- Monthly and all-time charts sourced from D1 unique Likes.
- Signed-in-only Like and Follow actions.
- One active Like per member/song and one active Follow per member/artist.
- Join/sign-in gate when a guest tries to Like or Follow.
- Artist interview preview dialog.
- Contest and fan-choice concept section.
- Community prompt with browser-local preview comments.
- Submission rules covering ownership, violence/threats, hate, minors, explicit content, AI disclosure, and human review.
- Curated-revenue concept section.
- Email-based submission call to `chuneside@gmail.com`.
- Browser share action in the footer.
- Cloudflare Worker and D1 deployment structure.

## Demonstration-only behavior

These elements look and behave interactively but are not backed by complete production systems:

- The eight demo releases still exist as a public fallback when the database catalogue is unavailable or disabled for the current visitor.
- Demo music playback is simulated; approved database releases with uploaded media use real browser audio playback.
- Hero feature metadata rotates, but every hero selection currently uses the same supplied loop video.
- Community comments are stored only in `localStorage` on the visitor's device.
- Contest voting exists only in React state and disappears on refresh.
- Track durations, legacy reaction figures, contest figures, artist stories, and profiles are sample content.
- Footer sharing invokes the browser share/clipboard behavior but has no referral attribution.

## Planned / not yet implemented in the hosted source

Do not represent any item below as already complete:

- Supabase project configuration, Google provider credentials, custom production SMTP, and a live end-to-end verification pass.
- A durable Supabase subject-to-member mapping migration. The current bridge safely reuses an existing D1 member record when its verified email matches the Supabase account, preserving its roles and ownership while migration metadata is repaired.
- Broader public self-serve direct uploads beyond linked artist workspaces.
- Advanced ChuneSide Stage browsing modes and verified listen analytics.
- Video uploads, waveform/audio processing, or transcoding.
- Dispute records and detailed licence records.
- Download sales, artist opt-in, payments, revenue splits, accounting, or payouts.
- Dynamic hero image/video library, editable hero copy, seasonal themes, banners, and studio controls.
- Automatic catalogue totals under territory/genre filters and release sort options.
- View/listen counters and verified stream-count rules.
- Member activity/seniority ranks, emblems, session duration, share points, and referral points.
- Artist milestone notifications and permanent activity feed.
- Durable community discussion, moderation tools, reporting, or notifications beyond the announcement bar.
- Durable contest entries, judges, scoring, fan voting, winners, and prize management.
- Artist spotlight/interview content management.
- Advertising inventory or sponsor-management controls.
- Offline cache expansion, push notifications, and richer PWA lifecycle UI.
- Analytics dashboard and verified share/referral attribution.
- Real social profile links for the sample artists.

## Separate offline prototype included for reference

`reference/offline-test-studio/` is a separate browser-only prototype, not the hosted production application. It contains locally stored experiments for features such as editable artists/releases, hero media, themes, counts, fan ranks, milestone notices, and member controls. Its IndexedDB data model and authentication demonstrations must not be copied into production as security architecture. Use it only to understand desired interactions and visual ideas.

## Important design and product decisions

- Preserve the spelling and capitalization `ChuneSide`.
- Brand line: “From Wadadli, the Caribbean and the World.”
- Keep Wadadli prominent even as Caribbean and worldwide submissions are considered.
- AI-assisted releases must be clearly identified rather than mixed invisibly into human-created music.
- Guests can browse/listen, but ranking actions must require a verified account.
- Song charts use unique active member Likes; removing a Like removes it from the ranking.
- Monthly totals use the calendar month; all-time totals use all active Likes.
- Uploaders must affirm ownership or permission, and ChuneSide needs the right to review, reject, remove, and use approved material for platform promotion under clear terms.
- Many future capabilities should be independently switchable from administration so unfinished or paused modules can remain disabled.

## Authentication warning for the next developer

Supabase Auth is wired into the application but no Supabase project credentials or Google client credentials are committed here. The Supabase dashboard must enable Google and email confirmation, register the `auth/callback` and `auth/confirm` redirects, and customize the confirmation template to send its token hash to `auth/confirm`. Never put OAuth client secrets, service-role keys, or password hashes in browser code.

If auth is migrated away from SIWC, preserve accountability by giving every person one canonical member ID and linking uploads, profiles, Likes, Follows, moderation history, and rights declarations to that ID.

## Recommended continuation order

1. Configure the Supabase project, Email and Google providers, redirects, confirmation template, and production SMTP.
2. Exercise real Supabase email/password and Google sign-in end-to-end with production-equivalent credentials, including role preservation for existing member accounts.
3. Repair the Drizzle migration journal/snapshot history, then extend `members` with a durable Supabase subject mapping through a new migration.
4. Exercise the full admin-test flow locally: seed catalogue, link an artist owner, submit metadata, upload media, review, approve, and confirm homepage playback.
4. Exercise AI controls through a signed-in Admin session after migration `0007`: configure global policy, set an artist exception, submit qualifying AI releases, and confirm the server blocks over-limit submissions with the next eligible date.
5. Run `npm run smoke:mobile` against the running preview, then perform visual mobile QA across homepage, `/stage`, artist profiles, Artist Dashboard, and Admin screens.
6. Use Admin Accounts roster filters to decide which test users should hold admin and artist roles before any wider private preview.
7. Add stream/listen event accounting only after playback, identity, and anti-abuse rules are agreed.
8. Add analytics/ranking/milestone features only after stream and activity events have enforceable server-side definitions.

## Latest local verification notes

- A local-auth smoke server can be started with `CHUNESIDE_ADMIN_EMAILS=codex-admin@chuneside.local` and `CHUNESIDE_ENABLE_LOCAL_AUTH=1`.
- `npm run smoke:local-admin` now runs the repeatable local Admin/backend smoke test against `CHUNESIDE_SMOKE_BASE_URL` or `http://localhost:5178` by default.
- With migrations `0006`, `0007`, and `0008` applied to local D1, Admin API smoke tests passed for account private-preview notes, catalogue seeding, announcement create/update/delete, AI upload settings and artist exceptions, artist media upload, review blocking before media, review approval after media, rejection note enforcement, rejected-release catalogue exclusion, rejected-media privacy, catalogue playback URLs, Stage draft creation, Stage consent rejection, consented Stage publication, Stage archive/public hiding, Stage view counting, filtered browsing, and AI upload-limit enforcement.
- Public unauthenticated `/stage` hides admin-test Stage records; local admin headers reveal them while the feature flag remains `admin_test`.
- Artist submission smoke tests passed with a local linked admin/artist account: the first primarily AI-generated release entered `pending`, and the second qualifying submission returned `429` with the next eligible date under the one-track / fourteen-day default policy.

## Validation and packaging expectations

- Install from the committed lock file.
- Run `npm test`, which performs a production build and the included Node tests.
- Run `npm run lint` separately.
- Check all relative asset references and imports before packaging.
- Exclude generated folders and machine state: `.git`, `node_modules`, `dist`, `.wrangler`, `.sites-runtime`, `.next`, coverage, and local environment files.
- Include `.env.example`; never include `.env`, private keys, credentials, tokens, or database files.
