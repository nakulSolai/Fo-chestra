# Validation record

The release checks and historical event results below have separate dates and evidence scopes. Times use America/Chicago unless stated otherwise.

## Release baseline checks, October 21, 2026

An isolated copy of the allowlisted public source was installed without the original `.env`, run history, receipts, recordings or organizer reference file. Application, test, dependency and configuration hashes matched the release working tree. Provider credentials were blank and live Fo actions were disabled. This checks the sandbox that a new user receives; it does not repeat a live integration test.

| Check | Fresh result |
| --- | --- |
| Locked dependency installation | Pass: 488 packages installed offline from the existing cache with lifecycle scripts disabled. No network download was needed. |
| `npm run typecheck` | Pass, exit 0. |
| `npm test -- --maxWorkers=1 --no-file-parallelism` | **73/73 pass**, 10 files, 38.51 seconds. Temporary files were routed into the isolated workspace. |
| `npm run build` | Pass, exit 0; approximately 279.84 kB JavaScript and 53.97 kB CSS before gzip. |
| `npm run test:e2e` | **5/5 pass**, approximately 1.4 minutes with installed Chrome and one test worker. |
| Publication hygiene | Explicit source allowlist, blank example credentials, live actions disabled by default, MIT metadata consistent, and no actual private contact/token/run identifiers found in the reviewed source. Two credential-URL patterns are deliberate synthetic rejection fixtures. |

The browser suite covers real fixture evidence and rejection without dispatch; approved simulation, backup research, completion and redacted export; missing live configuration; a synthetic partial-receipt view; and narrow/desktop/wide layouts. The saved-result case now also checks a nondefault synthetic historical run, a disabled control when history is absent, accessible benchmark data and zero mutation requests. The recording control discovers suitable existing local email-receipt history rather than depending on a private run UUID. That portability cleanup and public documentation were prepared after the event.

The first restricted unit run passed 72/73 tests but hit `EPERM` while atomically renaming a file in the operating system temporary directory. Routing `TEMP`/`TMP`/`TMPDIR` to the workspace made the focused run-store tests pass 2/2 and the full suite pass 73/73; no source change was needed for that environment issue. Windows/libSQL retained some ignored synthetic teardown databases, consistent with the lock limitation recorded below. Browser tests used reviewed execution outside the restricted process sandbox and still bound the application only to loopback.

Only two new sandbox records were created in the isolated test workspace: one completed and one cancelled after rejection. The completed run captured three browser workers with peak concurrency two. There were zero paid model requests and zero live Fo tasks. The original event run store was not used by these checks. Actual desktop and completed-run captures were inspected and the public-safe images are included under `docs/assets/`. The side-panel browser preview could not attach during this release pass; the automated installed-Chrome checks and captured images provide the UI evidence.

## Event validation, October 18–19, 2026

The user explicitly approved one exact zero-spend email, and the app submitted it once. Independent Gmail inspection confirmed delivery, but Fo added an unapproved signature/promotional footer and an HTML alternative: **delivery verified; exact content/format requirements failed; overall result partial**. During that validation pass, no resend, commit, push, publication, call, booking or purchase was performed.

## Commands and real behavior

| Check | Result and scope |
|---|---|
| `npm run typecheck` | Pass, exit 0 with current source and 5.5 model adapters. |
| `npm run build` | Pass. Latest UI bundle about 273 kB JavaScript / 51 kB CSS before gzip. |
| `npm test` | **71/71 pass**, nine files: engine 8, browser policy 26, model serialization 7, Fo client 8, ledger 8, API security 3, run store 2, email MIME/outcome checks 6, email action correlation 3. |
| `npm run test:e2e` | **5/5 pass**: real fixture browsers → rejection; approval → simulated Fo + backup → completion/evidence/export; missing model configuration; synthetic saved live receipt with partial content checks; responsive 390/1440/3840 px layout. Final suite elapsed 36.4 seconds. |
| `npx tsx scripts/browser-smoke.ts` | Real installed Chrome: two isolated profiles, captured fixture facts/screenshots, cancellation verified, zero newly leaked profiles, no inference. |
| `npx tsx scripts/check-models.ts` | Anthropic authentication succeeded; official API listed Opus, Sonnet and Haiku 5.5; zero inference requests. |
| `npx tsx scripts/live-preparation.ts` | Real Sonnet 5.5 planning, Haiku 5.5 public-page extraction, Sonnet 5.5 evidence review; exact email draft stored at an approval barrier before separate user approval. |
| Standalone Fo OAuth/discovery | Authenticated app session; actual MCP initialization/discovery returned `ask_fo`, `get_fo_reply`, `get_fo_conversation`, `list_fo_conversations`, `start_fo_call`. The exact approved email subsequently went through this app session. |
| Independent Gmail preflight | Existing read-only connector authenticated to the requested destination account. Exact unique-subject search returned zero messages before sending. |
| Approved live Fo email | One application dispatch through MCP SDK Streamable HTTP `ask_fo`; Fo returned `complete` in about 18.16 seconds. Independent receipt checks found actual delivery with unapproved body and MIME-format changes. |
| Git hygiene | `.env`, runtime data, reports and `/demo-recordings/` are ignored; `src/shared/types.ts` is visible. `git diff --check` passed. |

The full test suite ran after the worker-limit, draft-edit invalidation, failed-receipt budget reservation, Fo discovery-state and explicit partial/uncertain verification changes. The real receipt was then recorded on the existing run with all six checks, without a new Fo submission. API inspection confirmed one `fo_submit` event, provider and ledger status `complete`, independent status `partial`, and checks preserved in the redacted export without the recipient.

Windows process sandboxing interfered with Chrome/CDP ownership. The local app and isolated browser smoke were run with reviewed execution outside that process sandbox; the app still binds only to loopback and uses workspace-owned profiles. No duplicate browser MCP or browser download was needed. Stagehand's Windows close handshake caused an earlier 30-second stall; bounded owner shutdown was fixed and actual cancellation/cleanup rechecked. A scoped process audit found no repository-owned main Chrome processes remaining.

During unit-test teardown, Windows/libSQL can retain file locks in ignored temporary database directories after `close()` returns. Close errors still fail tests; only verified workspace-scoped deletion handles `EPERM`/`EBUSY` as best-effort. These synthetic test artifacts are separate from the app's run/action databases and can be removed after all test processes exit.

## Live model usage

The prepared live run captured the stated purpose of `https://example.com/` using one browser worker, then stopped for human review.

| Stage | Model | Underlying requests | Input tokens | Output tokens |
|---|---|---:|---:|---:|
| Plan | Sonnet 5.5 | 1 | 1,628 | 594 |
| Stagehand extraction | Haiku 5.5 | 2 | 1,864 | 616 |
| Evidence comparison | Sonnet 5.5 | 1 | 1,406 | 468 |
| Total | | **4** | **4,898** | **1,678** |

Token/request counts were measured. Dollar cost and remaining account credits were not obtained and are not invented. Opus 5.5 was verified in official documentation, account model discovery and offline request serialization; a live Opus generation was not run.

Local private preparation files are `.data/validation/prepared-email.json` and `.data/validation/live-preparation.json`. They contain the exact recipient/subject/body, action ID, fingerprint and trace correlation. They must remain outside source control.

## Controlled sequential/parallel benchmark

`npm run benchmark` completed all six runs with real fixture browsers, the same goal and a simulated Fo wait. Order alternated to reduce systematic warm-start bias. Each run checked tampered-approval rejection, evidence/screenshots and zero paid inference.

| Repetition | Sequential elapsed | Parallel elapsed | Parallel Fo/browser overlap |
|---|---:|---:|---:|
| 1 | 17.418 s | 11.936 s | 3.559 s |
| 2 | 19.107 s | 11.874 s | 3.180 s |
| 3 | 33.913 s | 38.310 s | 4.570 s |
| Median | **19.107 s** | **11.936 s** | |

The median ratio is 1.60× for this controlled workload. The third parallel run was slower than the corresponding sequential run. This small sample includes browser startup, local machine variability and automatic local approval. It does not measure real Fo latency, prove a general speed advantage, or establish live task reliability. Raw measurements are in `.data/validation/benchmark.json`.

## Outcome verification and remaining boundaries

After the user's exact one-time approval, the app submitted the reviewed email through `FoMcpClient.submitApproved()` and MCP `ask_fo`. Dispatch intent was persisted before submission. The request returned `complete`, so live progress polling and question handling were not exercised in this run; those paths have contract/workflow test coverage. A timeout after possible acceptance is never an automatic retry.

The separate Gmail connector found one matching message after the zero-result baseline and read its full MIME payload. The immutable Gmail message ID, received timestamp, full plaintext and body hashes were retained privately. The actual receipt time was **October 19, 2026, 12:18:20 a.m. CDT**. The app accepts this operator-supplied evidence as `operator_gmail_receipt`, distinct from a human attestation or Fo's own response. Gmail credentials remain with the Codex connector; the standalone app does not contain a Gmail OAuth integration.

| Independent receipt check | Actual result |
|---|---|
| Delivery observed at destination | Pass: matching message in Gmail INBOX |
| Exact sole visible recipient | Pass |
| Exact subject | Pass |
| Full normalized body equals approved text | **Fail**: signature and promotional footer appended |
| No attachments | Pass: no attachment MIME parts, filenames or attachment IDs |
| Plain-text-only format | **Fail**: multipart/alternative includes HTML |

The approved four lines were present, but a matching prefix is not an exact-body match. The checker retains the additional text rather than stripping signatures. The provider's `complete` report and completed dispatch ledger remain unchanged; independent verification records the deviation as **partial**. No replacement email was sent. The $0 cap was explicit and Fo reported no spend; no independent billing audit was performed.

`scripts/verify-email-receipt.ts` reads the actual private connector result, verifies the current action correlation and receipt freshness, then records the six checks. It has no Fo submission path. Redacted exports preserve check outcomes and remove the private message/reference. SENT-only copies, stale or mismatched action metadata, unexpected binary MIME payloads, missing fields, signatures and HTML alternatives are covered by regression tests.

If an independent receipt cannot be confirmed, verification stays uncertain. Real bookings, calls, purchases, live progress/question transitions, remote idempotency, live browser/Fo overlap and production multi-user deployment remain untested. Browser coverage is intentionally bounded to public read-only pages with page scripts blocked; sign-in and JavaScript-dependent workflows are outside this implementation's validated path.

Rendered artifacts were inspected at the prepared/completed/desktop/mobile/4K paths produced by `tests/e2e/ui.spec.ts` and `.data/ui-evidence/live-partial-delivery-checks.png`. Read-only browser inspection of the actual live run confirmed “Partial result,” the precise delivery/content-deviation label, six result rows and zero mutating requests or browser errors. Actual-run captures are preserved outside Playwright's `test-results/` cleanup directory. These ignored artifacts are private local review evidence, not files included in a clean public clone.

The final local server runs with live actions disabled. Its restart cleared the in-memory Wajo OAuth session; future live actions require a new connection and their own approval. Existing run data and the completed dispatch ledger remain intact.

## Evidence categories

- **Verified in current source/documentation:** typed Mastra execution/suspension, bounded Stagehand extraction, MCP transport/OAuth, the transactional approval boundary and explicit receipt checks. Package versions and reuse ownership are recorded in `DEVELOPMENT.md`.
- **Demonstrated in working examples:** isolated Chrome research/cancellation; persisted workflow review/resumption; actual Sonnet/Haiku requests; actual standalone Fo discovery and one approved email; independent Gmail delivery inspection with a partial content result. The sequential/parallel benchmark uses real fixture browsers and simulated Fo.
- **Compatibility inferred but not tested:** using the approved MCP path for other Fo tasks does not establish that a particular booking, call or vendor workflow succeeds. Public-page behavior beyond the tested sources is also unproven.
- **Architectural proposals requiring validation:** automatic dynamic replanning, a dedicated fast decision-model router, unrestricted/sign-in browser automation and production multi-user operation. These are not presented as working features.

## Recording readiness, October 19 morning

The existing loopback server was healthy with live actions disabled. No restart or new OAuth session was needed. The `?record=1` presentation view redacts live private text synchronously, removes screenshots/receipt references, preserves actual status/checks/metrics, and renders a sanitized snapshot of the six benchmark measurements. Two focused privacy tests passed; type checking and the frontend build passed. A read-only browser check verified no recipient, subject test identifier, conversation identifier or Gmail message identifier in visible text, all six original checks preserved, correct benchmark numbers, zero mutating requests and no browser errors.

One continuous captioned browser recording then completed with a fresh sandbox run: two concurrent primary browsers, three completed browser workers, exact simulation approval and measured overlap. It used no saved-sandbox fallback and submitted zero new live actions. The 118-second source capture and 118.13-second 1080p H.264 MP4 are under `demo-recordings/fo-chestra-demo-2026-10-19T15-43-29-780Z/`. Five key frames and media metadata were inspected. This is a silent browser capture, not a microphone recording; complete owner playback/privacy review is still required before publication. The original email remains historical evidence and was not resent.

A final dinner-goal take was captured under `demo-recordings/fo-chestra-demo-2026-10-19T16-41-33-538Z/`, again with all three browser workers complete, peak concurrency two, no fallback and no new live action. The finished file is `demo-recordings/final/Fo-chestra-demo.mp4`: 118.133333 seconds, 1920×1080 H.264 at 30 fps, AAC 48 kHz stereo, 5,995,052 bytes. Ten timed narration segments use the installed offline Microsoft Zira Desktop voice. All fit without speech overlap; the last ends at 117.114 seconds. A full decode passed, audio mean/max levels were -23.8/-5.7 dB, and final keyframes were visually inspected. The source and final video-stream SHA-256 hashes match, confirming narration was added without changing the continuous video. The final MP4 SHA-256 is `4BF8BA45C1F215DBFB6F65276BF362C30E16E48C0DF08CD8AC5C9E329B436269`. The preview URL returns HTTP 200 with `video/mp4`. No publication or commit occurred.
