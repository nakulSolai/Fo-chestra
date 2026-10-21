# Development architecture and attribution

This document describes the v0.1.0 prototype and its October 18–19, 2026 integration evidence. Later release checks are dated separately in [VALIDATION.md](VALIDATION.md). The working app was developed during the October 17–19 event; there was no earlier working app.

## Reused implementations

The resolved dependency tree is retained in `package-lock.json`. Versions and license identifiers below were read from the installed event-build manifests.

| Existing implementation | Version; license | Role |
| --- | --- | --- |
| [Mastra](https://github.com/mastra-ai/mastra) | core 1.67.0, libSQL 1.23.0; Apache-2.0 | Agent reasoning, workflow fan-out, suspension/resumption and execution storage |
| [Stagehand](https://github.com/browserbase/stagehand) | 3.7.3; MIT | Browser intelligence and typed extraction |
| Mastra Stagehand adapter | 0.3.5; Apache-2.0 | Installed and inspected; runtime workers use Stagehand primitives directly to retain the narrow read-only boundary |
| [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) | 1.30.0; MIT | Streamable HTTP and OAuth protocol primitives |
| [Vercel AI Anthropic provider](https://github.com/vercel/ai/tree/main/packages/anthropic) | 2.0.109; Apache-2.0 | Anthropic requests through the Mastra/Stagehand model interfaces |
| [Playwright Test](https://github.com/microsoft/playwright) | 1.64.1; Apache-2.0 | Repeatable UI verification using installed Chrome |

React, Hono, Vite, TypeScript, lucide and their dependencies provide application, build and interface foundations. Anthropic and Fo/Wajo provide external inference and action services. Their frameworks, APIs and service implementations are not claimed as Fo-chestra's original work; preserve applicable third-party notices when redistributing their code.

## Fo-chestra's contribution

The application adds a general goal interface; bounded ownership of isolated browser workers; exact-action approval fingerprints; a transactional dispatch ledger; cumulative cross-run spending reservations; conservative ambiguous-outcome handling; source correlation; coordinated browser/Fo work; an evidence interface and redacted exports; and independent destination/content checks.

Mastra owns reasoning and workflow coordination. Stagehand v3 owns browser intelligence. Fo-chestra's authorization ledger remains separate from workflow snapshots because execution state cannot itself grant permission for an external write. Browser observations and model confidence are not approval.

Two browser workers are allowed concurrently by default. Model steps, network access, screenshots, traces, timeouts and retries are bounded. Completion/cancellation closes owned browser resources. On restart, interrupted browser work is not automatically replayed, while uncertain external submissions remain blocked from blind resubmission.

## Local runtime and trust boundaries

The application binds to loopback. Its API validates Host, same-origin requests when Origin is present, JSON mutations, bounded bodies, run identifiers and worker paths. Live browser reads block private network targets, active requests, page scripts, sign-in, form submission and model-controlled actions. A JavaScript-dependent or automation-blocked website may fail visibly.

MCP OAuth uses state/PKCE and in-memory credentials. The app discovers compatible Fo schemas before dispatch. An OAuth session in another client does not authenticate this app, and restarting clears its in-memory Fo connection.

Approval binds the exact target, payload, constraints and maximum spend. Changing them invalidates approval. Dispatch intent is persisted before submission. A timeout after possible acceptance produces an unknown outcome for reconciliation rather than an automatic retry; local cancellation does not prove remote cancellation. Spend reservations include uncertain submissions and cannot independently guarantee provider billing limits or remote exactly-once execution.

Exports default to removing free text and contact payloads. Local screenshots, snapshots and raw proof can still contain private information; inspect them before sharing. Credentials, runtime databases, browser profiles, logs, raw traces, recordings and private communications stay outside Git. The repository includes only sanitized example configuration and public source/reference summaries.

## Integration evidence and operating lessons

The event's sandbox used installed Chrome with real fixture navigation and no paid inference. Actual Sonnet/Haiku planning, extraction and evidence review were also run separately. The standalone application's Fo OAuth/discovery succeeded, and one specifically approved email went through its MCP SDK client. A separate read-only Gmail connector confirmed delivery and found content/format deviations; this remains a partial result, not a built-in Gmail integration.

The Windows browser close handshake initially stalled. Bounded owner shutdown was added, and cancellation/cleanup were rechecked with no newly leaked owned browser profiles. Windows/libSQL may retain locks during test teardown; verified workspace-scoped temporary cleanup handles only those synthetic artifacts and remains separate from app databases.

The build reused the existing Chrome installation rather than adding a cloud browser, container stack or another browser MCP. Targeted framework documentation, installed declarations and versioned upstream source informed integration decisions. Organizer specifications were reference inputs; private originals are retained locally rather than redistributed here.

## Verification and future work

Tests exercise source/network policy, exact approval and cross-run budgets, MCP parsing/timeouts, API validation, persistence, receipt correlation and rendered sandbox behavior. Contract tests do not establish arbitrary live service compatibility. The [validation record](VALIDATION.md) identifies actual model, browser and Fo examples separately and preserves the real email's partial outcome and the benchmark's slower parallel trial.

Real bookings, calls, purchases, live progress/question transitions, remote idempotency, live browser/Fo overlap and production multi-user operation remain unvalidated. Dynamic replanning, a fast decision-model router and unrestricted/sign-in browser automation are proposals requiring additional implementation and evidence.

The v0.1.0 baseline preserves the submitted prototype. Future changes should keep their own implementation and validation dates. Follow [AGENTS.md](../AGENTS.md): prepare exact approval payloads before live actions, independently check outcomes, retain provider deviations, preserve user work and keep the scope of evidence explicit.