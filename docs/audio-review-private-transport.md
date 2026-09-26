# Audio Review private transport checkpoint

This is a local contract and simulation, not a deployed Queue consumer or processor. `audio_review` remains OFF by default. No route exposes job claims, lease tokens, or private media. The processor port's `authorize()` method is a mockable boundary, **not** a production authentication implementation.

## Repository state and identity

This feature branch has `DB` and `MEDIA` in production/local Wrangler configurations, but no Queue, service, or Container binding. `worker/index.ts` handles fetch/image requests only. The separate staging configuration is on another branch; it is not present in this checkout. `vite.config.ts` currently selects `wrangler.production.jsonc` for builds here. Do not deploy this branch as staging or add a binding without first integrating and re-verifying the staging-only build selection. The staging Supabase/OAuth redirect problem is separate and untouched.

The queue payload is exactly a UUID job ID string. `enqueueTechnicalAudioCase` creates/deduplicates the D1 job and sends that ID; it never sends an R2 key, URL, filename, user ID, lease, finding, or command. D1 remains authoritative. D1 insertion and Queue send are not atomic: a send failure leaves a queued row for a future sweeper to republish. Queue duplication is harmless because the conditional D1 claim admits one lease owner.

## Recommended first-party path

Use a staging-only Queue with a push consumer Worker. The consumer, not the native processor, owns D1 `DB`, R2 `MEDIA`, and the lease token. It validates the message, claims the job, resolves the exact eligible `release_media` row, and streams only that R2 object's body through a Service binding to a private processor Worker/Container. The processor has no D1/R2 binding, no artist session, no browser route, and never receives the R2 key or lease token. Cloudflare Service bindings can target Workers with no public URL. R2 and Worker streams avoid buffering a 40 MB WAV in Worker memory. Confirm streaming request behavior and actual FFmpeg runtime/disk capacity in isolated staging before treating this as production-ready.

The local `consumeTechnicalAudioWakeup` mirrors those boundaries: it requires an environment-matched authorized processor port, rejects non-technical or analyzer-version-mismatched jobs, conditionally claims and starts, rechecks open case/current media/lease/flag, fetches the D1-selected object, and submits a versioned structured result through the existing conditional D1 completion. The test port is deliberately injectable; the real port must be supplied only from a configured Service binding, never from request JSON. The Worker must never expose this function as a public API. Exact media identity is copied before handing metadata to the processor, preventing a returned object from mutating the comparison baseline.

The Worker renews its own lease every 20 seconds during analysis. Renewal is conditional and bounded by the existing 15-minute job maximum. Loss of ownership aborts the streamed process and prevents finalization; the native analyzer now propagates that signal to FFmpeg/ffprobe child-process termination. It also retains its 30-second tool timeout. Queue consumer invocations themselves have a 15-minute wall limit, so a production runtime must keep a safety margin and use retry/reconciliation for longer work.

The Node-only `analyzePrivateAudio` writes to an OS-created unique directory with restrictive permissions where supported, uses a fixed `input.audio` filename rather than artist input, rejects an over-40 MB or mismatched stream, invokes the existing argument-array FFmpeg processor, and removes the directory in `finally`. The analyzer's tool output and filesystem paths never become job findings. A deterministic decode failure is a completed technical finding; infrastructure/media access failures use the bounded job retry states. The adapter has no URL-based lease or media access.

## Failure and delivery behavior

| Situation | D1/transport result |
| --- | --- |
| Duplicate/delayed message, completed job, valid existing lease | No new claim; no second authoritative result |
| Expired lease | Reclaim within attempt budget; old owner cannot finalize |
| R2 missing/changed | Categorical `media_access` retry, no raw key in D1 |
| Oversized media | Terminal invalid-input processor job, no R2 read |
| Processor crash/identity mismatch | Categorical retryable analyzer failure; no result findings |
| Malformed audio that fails decoding | Successful analysis with deterministic technical failure finding |
| Media replaced or case closed during analysis | D1 finalization refuses and reconciliation supersedes old job |
| D1 completion/finding write fails | Batch rolls back; lease remains until retry/reconciliation, no partial result |
| Queue send fails after job creation | Queued row persists; future sweeper must republish |

Queue acknowledgements, delayed retries, and stale-row sweeping are **not** wired yet. A future consumer must base ack/retry on these outcomes and the D1 `next_eligible_at` value, with bounded Queue retries and a dead-letter/alert policy. No automated result can approve, reject, publish, unpublish, change AI classification, or penalize an artist.

## Alternatives and isolation gate

Preferred private-media transport: Worker-side R2 binding plus streamed Service-binding request. A short-lived signed R2 URL would add URL leakage and expiry/replay handling; direct R2 credentials in a processor would broaden its access to the bucket. An external container could pull Queue messages with an account-scoped Queues read/write token, but also needs a separately protected private media/result channel and host operations. That is a valid fallback if Cloudflare Containers are unavailable or unsuitable, not a reason to put permanent R2 credentials on the host.

Before any provisioning, confirm the account's **Workers Paid** status (R2 Paid alone does not establish it), the Container cost ceiling, and staging Worker/Queue bindings. Cloudflare documents Queues on Free and Paid plans (Free: 10,000 operations/day and 24-hour retention). Containers require Workers Paid (minimum $5/month) and can incur CPU, provisioned memory/disk, Worker/Durable Object, logs, and region-dependent egress charges. The `basic` Container tier has 1/4 vCPU, 1 GiB RAM, and 4 GB disk; benchmark a 40 MB WAV there before selecting capacity. No current account entitlement or bill has been verified in this phase.

Proposed **staging-only**, subject to approval and account review:

| Resource | Name/binding | Scope |
| --- | --- | --- |
| Queue | `chuneside-audio-review-staging` / producer `AUDIO_REVIEW_QUEUE` | Only `chuneside-site-staging` may enqueue |
| Queue consumer Worker | `chuneside-audio-dispatch-staging` | Staging `DB` (`8854df00-b77d-40ae-95c6-e81e839f122f`) and `MEDIA` (`chuneside-staging-r2`) only; no public URL |
| Private processor Worker/Container | `chuneside-audio-processor-staging` / service `AUDIO_PROCESSOR` | Native FFmpeg, no D1/R2 binding or public URL |

Production would require separately named Queue, dispatch, processor, bindings, and configuration after staging proof and separate approval. Fail closed on missing/incorrect environment markers and target names/IDs; never fall back to production resources. The staging branch and its access gate must be integrated and audited first. Live staging admin checks remain blocked by the separate OAuth issue, but no OAuth configuration is needed for the local simulation.

Relevant platform documentation: [Queues limits](https://developers.cloudflare.com/queues/platform/limits/), [Queues pricing](https://developers.cloudflare.com/queues/platform/pricing/), [Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/), [R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/), [Worker streams](https://developers.cloudflare.com/workers/runtime-apis/streams/), [Container pricing](https://developers.cloudflare.com/containers/platform/pricing/), [Container limits](https://developers.cloudflare.com/containers/platform/limits/).
