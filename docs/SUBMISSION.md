# Hackathon submission record

This is a dated archive of Fo-chestra's October 2026 event submission. The working application was built during the **October 17–19, 2026 Wajo AI × Anthropic hackathon**, with no earlier working app. Existing frameworks, APIs, organizer specifications and reference material were reused and are attributed below.

The [native X quote-post with the demo](https://x.com/nakulsolai_wisc/status/2112237731963154724) was published, and the Google Forms submission was confirmed on **October 20, 2026**. Private confirmation details, contact information and receipt identifiers are retained locally rather than published here. The v0.1.0 release preserves the prototype; later documentation/publication work does not imply an earlier commit history.

## Project and audience

Fo-chestra is a work in progress for builders and teams coordinating browser research with human-approved real-world follow-through. It collects source evidence in isolated browser workers, pauses for approval of an exact Fo action, and distinguishes observations, recommendations, provider reports and independently checked outcomes.

The local contribution is the general goal interface, bounded browser ownership, exact-action approval fingerprints, cross-run spending reservations, persisted dispatch claims, conservative handling of unknown outcomes, coordinated backup research, evidence/trace interface, redacted exports and independent delivery/content checks.

## Reused foundations

Mastra provides agent reasoning, workflow execution, concurrency, suspension and storage primitives. Stagehand v3 provides browser intelligence. Anthropic supplies model inference; the MCP SDK supplies transport and OAuth primitives; Fo/Wajo supplies the external action service. React, Hono, Vite and lucide provide application/interface foundations. Versions and ownership are recorded in [DEVELOPMENT.md](DEVELOPMENT.md).

Organizer materials and framework references informed the implementation; their content is not claimed as original project work. The working app was built at the event rather than adapted from an earlier working app.

## Demo and mock disclosure

The submitted video is a **118.13-second continuous browser take** with readable captions and offline synthetic Windows narration. Adding narration preserved the video stream without cuts, replacements or speed changes. The recording performed zero new live Fo actions.

- The fresh sandbox flow uses real Chrome/Stagehand navigation and screenshots against fictional local vendor pages. Planning/comparison and Fo actions/waits are simulated.
- The saved real email segment is explicitly historical. One approved Fo dispatch produced one independently observed delivery. Added signature/footer text and HTML violated the exact body/format requirements, so there are **zero fully compliant live outcomes and one partial outcome**. No resend was made.
- The independent Gmail evidence came through a separate operator connector. The standalone app has no Gmail OAuth integration, and private original proof is absent from a clean clone.
- The benchmark contains six controlled fixture runs, three per strategy, with real browsers and simulated Fo. Median elapsed times were 19.107 s sequential and 11.936 s parallel. One parallel trial was slower. The small sample is not a general live-service speed claim.

See [VALIDATION.md](VALIDATION.md) for dated methods, outcomes and remaining limitations. Tests passed are not a denominator for real-world task success.

## Build note

Fo-chestra uses Mastra, Stagehand v3, Anthropic Claude, the MCP SDK, React, TypeScript and Playwright. Its original engineering work is exact authorization, persisted dispatch claims, bounded Fo/browser coordination and independent outcome checks. An initial Windows browser shutdown stalled on Stagehand's close handshake; bounded owner shutdown was repaired and cancellation/cleanup rechecked.

The live email additionally exposed a provider constraint failure: delivery succeeded, but the provider added a footer and HTML. Those deviations were preserved as a partial result rather than removed from the evidence or followed by an unapproved resend.

## Requirement provenance

The organizer-provided kickoff deck was audited locally on October 19, including slides 4, 10 and 14 and their notes. It specified a live or unedited key-action demonstration and fields for the X link, team contacts, video, audience, event-built/pre-existing work, mocks, tools, original contribution, a failed approach, one real run's trace and total/successful run counts. Slide 14 notes described the social-sharing consent. The owner completed the form separately; this archive contains no private form receipt.

The [official Luma event page](https://luma.com/buo3rgvs) and organizer Discord supplied scheduling information. The original October 19 launch-post timing was later revised in Discord after a posting delay; it is historical event context, not a current publication deadline. The announced form/community-voting deadline was October 20 at 10:15 AM Pacific / 12:15 PM Central.

Raw organizer documents, private communication, recordings and receipt proofs remain outside the public source tree. The [recording notes](RECORDING.md) describe what can be reproduced from this repository and what belongs only to the historical demonstration.