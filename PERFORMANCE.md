# ChuneSide Performance Rules

Performance, responsive behavior, scalability, and efficient resource use are release requirements for every feature.

## Current audit baseline

- The home screen makes separate reads for member state, feature flags, catalogue, announcements, site content, visualizer settings, and Stage placement. These are intentionally independent because they have different permissions and failure fallbacks; the browser can request them concurrently.
- Public catalogue reads currently return up to 100 approved releases so the existing client-side discovery filters and ranking views keep working. Pagination should be introduced together with a load-more or virtualized catalogue before reducing that window.
- Audio now uses `preload="none"`; playback loads only when the member starts a track. Artist release playback follows the same rule.
- The hero logo remains the only priority logo. The duplicate decorative hero logo is no longer marked priority.
- Public read APIs use short private browser caching with stale-while-revalidate to reduce repeat reads without sharing admin-sensitive responses between users.
- D1 already has indexes for release approval and lane, artist visibility and ownership, media lookup, listener/date analytics, shares, feature flags, and announcement scheduling. Avoid adding indexes without a query plan or measured workload.
- R2 media responses support byte ranges for audio and immutable caching for announcement backgrounds. Remote catalogue artwork remains unoptimized at the edge because the current media URLs do not provide a trusted image transformation pipeline.

## Rules for future work

1. Load data needed for the current view only. Use pagination, bounded queries, or efficient infinite scroll for growing collections.
2. Load audio on demand. Do not preload full audio or fetch media for cards that are not being played or opened.
3. Use responsive, properly sized images with lazy loading below the fold. Prefer a trusted image transformation pipeline before adding large originals to public pages.
4. Keep client effects and subscriptions scoped, cancellable, and free of duplicate requests or unnecessary rerenders.
5. Keep D1 queries bounded and projection-based. Add indexes for real filter and sort paths, and check for N+1 queries whenever a list joins related records.
6. Use Cloudflare caching only where the response is safe to cache. Keep member, admin, and signed media responses private.
7. Avoid blocking render work. Defer analytics, Stage views, optional controls, and non-critical media until they are needed.
8. After a major change, run the production build, automated tests, and a desktop/mobile smoke check. Record any deliberate tradeoff in the change summary.

