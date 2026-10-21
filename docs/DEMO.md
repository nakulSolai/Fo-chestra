# Reproduce the Fo-chestra demo

This guide reproduces the v0.1.0 sandbox interaction. The [submitted video](https://x.com/nakulsolai_wisc/status/2112237731963154724) also contains a historical real email result from the original workspace. Private run history and receipt evidence are not included in a clean clone.

## Sandbox walkthrough

1. Follow the [README setup](../README.md#try-the-sandbox), then open <http://127.0.0.1:4318>.
2. Keep **Sandbox** and **Parallel**. Choose a built-in example or enter a goal. Sandbox planning/comparison is deterministic and uses fictional local vendor pages.
3. Start the orchestration. Inspect the two browser workers, their screenshots and source observations. Those browser interactions are real; planning and Fo are simulated.
4. At **Your move**, inspect the exact operation, target, message, spending limit and approval fingerprint. Reject the first run to demonstrate that dispatch requires approval.
5. Start another sandbox run, review its action, and choose **Approve simulation** once. The simulated Fo wait overlaps with backup browser research in parallel mode. The concurrency limit remains two browser workers.
6. Inspect **Evidence** and **Run trace**. Keep observations, recommendations and simulated provider reports distinct. Inspect any redacted export before sharing it.
7. Optionally repeat an equivalent workload using **Sequential**, or run `npm run benchmark` against an otherwise idle app. Preserve unsuccessful runs, cache conditions and measured times when comparing strategies.

The application can show completed, partial, failed, cancelled and unknown outcomes. A cancellation is an observation about local execution; remote work may continue after local monitoring stops.

## Historical live result

During the event, one exact zero-spend email action was approved and submitted through the standalone app's authenticated Fo MCP client. A separate read-only Gmail connector independently confirmed delivery. Exact body and plain-text-only checks failed because Fo added a signature/promotional footer and an HTML alternative. The overall result remains **partial**; the message was not resent.

The original recording shows that saved result with private text hidden. Viewing history did not send another message. On a clean clone, the saved-result control is disabled without suitable app history. Describe the historical result using the [dated validation record](VALIDATION.md) or public video; do not present synthetic data as the original receipt. The app's receipt checker consumes correlated operator-supplied evidence; it is not a built-in Gmail connection.

## Optional live preparation

Live preparation requires the owner's provider configuration and can use paid inference. Follow [the live setup](../README.md#optional-live-setup) separately from the sandbox walkthrough.

1. Connect Wajo in the app and verify compatible tool discovery. Verify model access with an actual intended request when authorized.
2. Use a user-owned destination and prepare a narrow action with a specific target, exact wording, explicit constraints and maximum spend.
3. Stop at the approval barrier and inspect the complete payload. Reject or cancel when rehearsing without an approved send.
4. A real dispatch requires action-specific approval. If performed, preserve the actual trace and independently check the destination and delivered content afterward.
5. If acceptance becomes uncertain, reconcile the existing conversation where possible. Do not blindly submit the request again.

Changing target, wording, constraints or spending limit requires fresh approval. Test real actions only within their exact authorization; local preparation is not authorization to send, call, book or purchase.

## Verification and claims

Run the type check, focused tests, build and relevant UI checks for the source being demonstrated. The [validation record](VALIDATION.md) separates event-era evidence from later checks.

| Observation | Appropriate claim |
| --- | --- |
| Fixture browsers complete | Real bounded browser interaction with these local fixtures |
| Forged or altered approval is rejected | Approval enforcement for the tested public seams |
| Simulated Fo completes | Sandbox service behavior |
| Actual model requests succeed | That model/request path worked at the recorded time |
| Fo returns `complete` | Provider-reported completion |
| Gmail independently observes the message | Delivery observed at the destination |
| Body or format differs from approval | Partial outcome with the deviations retained |
| Controlled benchmark has lower median parallel latency | Measured difference for the disclosed fixture workload |

Live progress/question transitions, bookings, calls, purchases, remote idempotency, live browser/Fo overlap and production multi-user operation remain unvalidated. The event archive is [SUBMISSION.md](SUBMISSION.md), and recording provenance is [RECORDING.md](RECORDING.md).