# Demo recording provenance and reproduction

The [October 19 public demo](https://x.com/nakulsolai_wisc/status/2112237731963154724) is the submitted v0.1.0 demonstration. The finished local artifact is `demo-recordings/final/Fo-chestra-demo.mp4`: **118.13 seconds, 1920×1080 H.264 at 30 fps, AAC stereo, 5,995,052 bytes**. Recordings and working manifests are ignored by Git; the public source clone does not contain that file or private run history.

The final take uses a dinner-planning goal for eight people under $160 with fictional vendor fixtures. All three browser workers completed with peak concurrency two. The recording used no saved-sandbox fallback and performed no new live Fo action. Offline Microsoft Zira Desktop narration and captions accompany one continuous browser capture; adding narration did not cut, replace or speed up its video stream. Full decoding, audio levels, narration timing and key frames were checked during the event.

Final MP4 SHA-256:

```text
4BF8BA45C1F215DBFB6F65276BF362C30E16E48C0DF08CD8AC5C9E329B436269
```

The recording's later real email result is historical and redacted. Delivery was independently observed, but footer text and an HTML alternative violated approved content/format requirements. The result remains partial. Benchmark figures are a saved snapshot of six controlled fixture runs with simulated Fo waits.

## What a clean clone can reproduce

Follow [DEMO.md](DEMO.md) for a fresh sandbox run. The application performs real fixture browser research, exact simulation approval and backup overlap. It also includes the labeled benchmark snapshot in `web/recording-benchmark.json`.

The private historical email, its identifiers and original receipt are not distributed. The **Saved real Fo result** control is disabled without suitable local app history; a clean clone cannot recreate that original receipt by opening the recording view. Use the public video and [dated validation record](VALIDATION.md) to discuss the historical result. Any new receipt requires a separately authorized live action and independent inspection.

## Record a new sandbox take

Use <http://127.0.0.1:4318/?record=1> with live actions disabled. The presentation view hides private live text, screenshots and receipt references without changing original evidence. Review the visible page before recording; the flag does not authorize publication of all local history or exports.

1. Build and start the app using the README. Close unrelated tabs, notifications, developer tools, provider setup and private files.
2. Choose a repeatable scenario, keep **Sandbox** and **Parallel**, then start a fresh orchestration.
3. Show both primary workers and source evidence. State that browser interaction is real while planning/comparison and Fo are simulated.
4. At **Your move**, show the exact target, message, spending limit and payload fingerprint. Approve only the simulation.
5. Show the backup browser working during the simulated Fo wait, then inspect the resulting evidence and trace.
6. If discussing the benchmark, show all three repetitions per strategy and state that one parallel trial was slower.
7. If showing a saved outcome, explicitly label it historical. Omit private history when a safe presentation is unavailable.

Keep the key action continuous through real waiting. If a run fails, retain it in the run count and state the failure. Opening a saved sandbox run is a replay and must be labeled. A new clean take can start from the beginning; do not silently splice execution or present simulated evidence as a live action.

## Optional recording script

`npx tsx scripts/record-demo.ts` uses installed Chrome and system FFmpeg to create a local sandbox capture under ignored `demo-recordings/`. It requires a running app and suitable prior local history for its historical partial-result and saved-sandbox fallback segments, then writes its own manifest. This production script is not the primary clean-clone demonstration path; follow the interactive sandbox guide above instead.

The capture is silent unless narration is added separately. For microphone narration, use a recorder of your choice and verify audio with a short playback before the full take. The submitted video's offline narration is historical production work, not an additional app service.

Review the whole video, audio, simulation labels and visible private information before sharing. Preserve original evidence privately, and distribute only the reviewed artifact. The [submission record](SUBMISSION.md) archives the event requirements; a future recording has its own date and provenance.