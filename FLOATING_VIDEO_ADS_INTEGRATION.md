# ChuneSide Floating Video Ads

This document maps a future sponsor-video system onto the current ChuneSide architecture. It is a design and integration map only. No ad rendering, campaign schema, media upload, or analytics behavior is implemented by this document.

## Product contract

The feature should feel like a restrained widescreen video window, not a browser pop-up. Music and core discovery always have priority.

- The ad may appear centered or in a safe corner, but never cover the primary player, navigation, dialogs, forms, or important release actions.
- If ChuneSide music is playing, the ad must be muted.
- If music starts while an ad is already playing, mute the ad immediately. Never pause, stop, seek, restart, or otherwise control the music.
- Once muted because of music, the ad must never restore audio automatically. A future explicit user control may unmute it only while music is stopped.
- Closing an ad must persist for the current session and participate in frequency capping.
- Ads must be responsive, keyboard accessible, reduced-motion aware, and dismissible.
- Ad events must remain separate from listening, qualified streams, Likes, shares, and rankings.

## Existing integration points

### Global control

`lib/feature-flags.ts` already defines an `advertising` flag, currently off. The existing Admin Feature Control screen and `/api/admin/feature-flags` route should own the first global on/off switch. The future ad system should check this flag on the server and client before selecting or loading a campaign.

`sponsorships` is a broader product concept and is currently enabled, but it is not an ad inventory system. Do not treat it as permission to render floating video ads.

### Playback and mute authority

`app/page.tsx` owns the public homepage player state:

- `audioRef` is the single HTML audio element.
- `playing` is the authoritative UI playback state.
- `activeAudioUrl` identifies the selected release.
- playback effects call `audio.play()` or `audio.pause()` only for the music player.
- listening events are sent from the existing playback lifecycle.

The future ad component should receive read-only playback state, for example `{ musicPlaying }`, and own only its own `<video>` element. It must never call `audioRef`, `setPlaying`, `moveTrack`, `seekTrack`, or any listening endpoint. Its only playback reaction to music is `video.muted = true` and, optionally, a visual muted indicator.

The compact `.now-playing` bar is fixed on mobile and already reserves bottom space. A floating ad must use a separate stacking layer below dialogs and above ordinary content, with a mobile bottom offset that clears `.now-playing` and safe-area insets.

### Proposed component boundary

Add a lazy client component such as `app/components/floating-video-ad.tsx` and mount it once in `app/page.tsx`, after the News Bar and before ordinary page sections. Keep campaign selection and analytics requests outside the audio player component.

Suggested props:

```ts
type FloatingVideoAdProps = {
  musicPlaying: boolean;
  enabled: boolean;
  campaign: EligibleAdCampaign | null;
  onImpression: () => void;
  onComplete: () => void;
  onClick: () => void;
  onClose: () => void;
};
```

### Campaign selection and delivery

Add a small public endpoint such as `/api/ads/eligible` that returns at most one selected campaign and one creative for the current visitor. It should return no video URL when the global flag is off, the campaign is outside its schedule, the visitor is capped, or no campaign is eligible.

Selection should happen server-side so schedules, rotation weights, caps, and campaign status cannot be bypassed by editing browser state. The client should not download all campaigns or all creatives.

Use an explicit request boundary:

- fetch eligibility only after the page is interactive and the ad slot is eligible to appear;
- return a poster and metadata first;
- set the video source only after the ad is selected and the slot is visible;
- use `preload="none"` or `metadata`, never eager-download every campaign;
- use `IntersectionObserver` or an equivalent visibility check before loading playback bytes;
- keep ad requests out of the music listening event flow.

## Proposed durable data model

Use D1 for campaign metadata and event aggregates, and R2 for approved video/poster assets.

### `ad_campaigns`

Suggested fields:

- `id`, `name`, `sponsorName`, `status` (`draft`, `scheduled`, `active`, `paused`, `expired`)
- `startAt`, `endAt`, `rotationWeight`, `sortOrder`
- `position` (`corner`, `center`), `maxWidth`, `mobileMode`
- `frequencyCapCount`, `frequencyCapWindowSeconds`, `sessionCapCount`
- `clickUrl`, `dismissible`, `createdAt`, `updatedAt`, `updatedBy`
- `impressionGoal` or billing metadata only if a later sponsor contract requires it

### `ad_creatives`

Keep creatives separate so a campaign can rotate approved videos without rewriting schedule or cap settings:

- `id`, `campaignId`, `videoObjectKey`, `posterObjectKey`
- `contentType`, `sizeBytes`, `durationSeconds`, `status`
- `altText`, `caption`, `createdAt`, `updatedAt`

Use R2 object keys rather than raw upload URLs in D1. The existing media validation pattern in `lib/media-policy.ts` should be extended with an ad-specific limit and signature check rather than weakening release-media rules.

### `ad_events`

Keep these events isolated from `listening_events` and `share_events`:

- `id`, `campaignId`, `creativeId`
- `memberId` nullable, `visitorKeyHash` required
- `eventType` (`impression`, `start`, `25`, `50`, `75`, `complete`, `click`, `close`)
- `sessionKeyHash`, `occurredAt`, optional `durationSeconds`

Required indexes:

- `(campaignId, occurredAt)` for campaign reports and date filters
- `(creativeId, occurredAt)` for creative reports
- `(visitorKeyHash, campaignId, occurredAt)` for caps and deduplication
- `(memberId, campaignId, occurredAt)` for signed-in member reporting

Use the existing account system for signed-in members. For guests, derive a privacy-conscious rotating anonymous identifier and hash it before storage. Do not store raw IP addresses, email addresses, or browser fingerprints for ad caps.

## Frequency capping and rotation

Server-side eligibility should enforce:

1. campaign status and start/end dates;
2. global `advertising` availability;
3. visitor/session cap for the campaign;
4. a short cooldown after close or completed playback;
5. weighted rotation among remaining eligible campaigns.

The client may remember a dismissed campaign to avoid an immediate re-render, but client state is only a UX optimization. It is not the source of truth for caps.

An impression should count only after the ad has remained visible for a defined threshold, such as one second, and after the creative has loaded enough to render. A click should be recorded before navigation using `navigator.sendBeacon` or a `keepalive` request. Completion should use the native `ended` event plus a server-side duration sanity check.

## Layout and accessibility

- Desktop corner mode: constrained widescreen ratio, capped width, safe edge inset, close button, sponsor label, poster-first loading.
- Desktop centered mode: only after an explicit campaign setting and only in a non-blocking content area; never modal and never focus-stealing.
- Mobile: use a smaller bottom or top slot that clears the fixed Now Playing bar, browser safe-area insets, and the News Bar. Do not cover the primary play controls.
- Use `role="region"`, an accessible label, a visible close button, captions when speech exists, and no autoplay audio.
- Respect `prefers-reduced-motion`; reduce transitions and never require animation to understand or dismiss the ad.
- Do not trap keyboard focus. The close button must be reachable, and the ad must not shift page layout unexpectedly.

## Admin integration

Prefer a dedicated Admin Advertising section linked from the existing Admin navigation. It should reuse the current protected admin gate, audit log, upload validation, and button/form patterns.

Initial controls:

- global advertising on/off, with the existing Feature Control flag as the authoritative kill switch;
- campaign create/edit/pause/archive;
- start/end schedule, rotation weight, position, mobile behavior, click URL;
- frequency caps and close cooldown;
- video and poster upload with validation and R2 persistence;
- preview that is muted and never writes analytics;
- restore defaults for presentation settings;
- per-campaign impression, completion, click, close, and completion-rate summaries.

The existing Admin Analytics page can later receive a separate advertising panel, but ad totals must remain visually and logically distinct from song analytics.

## Performance safeguards

- Do not render or mount the ad video when the flag is off or no campaign is eligible.
- Do not preload video bytes for campaigns that were not selected.
- Use poster images and bounded video dimensions; do not use full-resolution artwork as a video poster without an explicit size limit.
- Keep selection responses small and cache only safe public eligibility metadata for a short private window.
- Use a separate endpoint and event queue path so ad analytics cannot slow or alter listening analytics.
- Use `sendBeacon`/`keepalive` for terminal events and tolerate analytics failure without affecting playback.
- Add mobile and desktop smoke coverage for the player while an ad is visible, including music-starts-during-ad and ad-starts-while-music-is-playing.
- Add a performance budget for the initial page and a separate budget for the deferred ad chunk/video request. Feature growth must not increase initial page weight when advertising is disabled.

## Rollout sequence

1. Add schema, migrations, indexes, and admin audit events without enabling public rendering.
2. Add R2 upload and controlled public delivery for approved creatives.
3. Add campaign eligibility and server-side caps with the global flag still off.
4. Add the muted, lazy client slot and playback isolation tests.
5. Add event collection and the separate Admin Advertising report.
6. Enable for Admin test users only, run mobile/desktop and playback regression checks, then enable publicly when sponsor inventory is ready.

## Explicit non-goals

- No mid-song interruption, pause, stop, seek, restart, or automatic audio restoration.
- No use of ad events in Likes, qualified streams, charts, recommendations, or artist analytics.
- No third-party ad network dependency is required for the first version.
- No ad code should load on the initial page when the global flag is off.

