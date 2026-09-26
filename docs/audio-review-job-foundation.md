# Audio Review job foundation

This layer is local application and D1 state management. It has no Queue consumer, remote processor, R2 read, or public API. The existing `audio_review` flag remains off by default. Enqueueing requires an existing eligible Audio Review case and an active admin-test/on flag.

## Identity and states

The unique job key is `(case_id, check_kind, analyzer_version)`. The case snapshots the release, media ID, variant, version, and source media ID. Job creation copies those identities from D1; callers cannot supply an R2 key or choose a media version. A newer analyzer version gets a separate job and historical result. The first completed check fills the case's summary status; later warnings still move an open case to `needs_review` and retain their own versioned findings.

Legal transitions:

| From | To | Condition |
| --- | --- | --- |
| queued, retryable | claimed | Eligible time, current media/case, attempt budget, flag on |
| claimed, processing | claimed | Prior lease expired, same conditions and remaining budget |
| claimed | processing | Current unexpired lease owner |
| claimed, processing | completed | Current unexpired owner; current media and open case |
| claimed, processing | retryable, permanently_failed | Current owner; retry category and remaining budget determine destination |
| claimed, processing | retryable, permanently_failed | Lease expired; reconciliation determines destination |
| queued, claimed, processing, retryable | superseded | Case closed/superseded or media version no longer current |

Completed, permanently failed, and superseded jobs are terminal. An expired lease can be reclaimed directly while attempts remain; reconciliation marks exhausted leases permanently failed. A scheduler/Queue consumer will later need to scan and reconcile stale rows. There is no live scheduler in this phase.

## Ownership and atomic results

Claiming uses a conditional SQLite `UPDATE`; the database's `meta.changes` determines the winner. Each claim has a fresh UUID lease token. Renewal requires that token, an unexpired lease, a current case/media, and the 15-minute maximum lifetime for that claim. Completion repeats those conditions in a single D1 batch containing the job result, case summary update, individual findings, and an event. D1 batches are transactional; a failed finding write rolls back the entire completion. Audit events contain no lease token or object key.

The job row holds the compact, versioned result JSON and final state together. Duplicate completion with the same lease and result returns the existing result; a stale or different completion is rejected. Findings are tagged with job ID, ordinal, analyzer version, and classification. A deterministic decode failure is a completed analysis with `fail` findings. Processor and media-access failures use retry states instead. Retryable categories use bounded exponential delay, at most one hour, with at most ten configured attempts. Failure messages are categorical and never store raw tool output.

The old direct `recordAudioCheckResult` path now creates and claims a job before writing a result. No job action changes release approval, publication, AI classification, artist standing, or media access. The future private processor must authenticate separately and resolve its exact R2 object through trusted D1 data after claiming; this layer does not expose object keys or lease tokens to browsers.
