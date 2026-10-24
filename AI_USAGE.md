# AI usage record

Human review remains pending unless explicitly recorded. No credentials or private conversations are included.

| Date/time | Tool | Contribution | Human review | Validation |
|---|---|---|---|---|
| 2026-10-24T23:40:20.4780257+05:30 | Codex | Set up a separate free Android 16 AVD; added actual native capturer/encrypted-storage instrumentation and guarded Windows capture/lifecycle/local-sync runners; recorded synthetic evidence and native UI screenshot | Pending owner review | 6/6 native tests, listener filtering/dedupe, process/access/reboot and native WorkManager → local Worker/D1 passed; all live/physical gates pending |
| 2026-10-24, before checkpoint cb9b687 (see actual Git timestamps) | Devin by Cognition | Initial domain/API/web/native Android implementation, tests, scripts and handoff | Pending owner review | Devin-reported results in `docs/CODEX_HANDOFF.md`; distinguish them from independently reproduced checks |
| 2026-10-24, Codex continuation (IST UTC+05:30; exact checkpoint time in CHANGELOG/Git) | Codex | Reviewed saved source and template; added strict English monetary-word parsing, source validation, notification receipt reconciliation test, receipt UI tests/Undo, Windows-compatible E2E server and dependency policy fixes | Pending owner review | Current independently run results and limits in `docs/PROGRESS.md` |
| 2026-10-24T21:59:59+05:30 (verified 22:08:44 IST) | Codex | Reviewed native storage/diagnostics; removed plaintext preview storage, scoped diagnostics to owner, added preview-cleanup migration and Android isolation/migration tests; recovered Gradle download using official checksum | Pending owner review | Debug/test/fixture builds pass; JVM scaffold 1/1; signature/packaged asset scan checked. Instrumentation not run due to VM ADB failure; see evidence/progress |

The owner requested switching from Devin to Codex because Devin usage was nearly exhausted. The existing history is retained; no attempt is made to describe Devin's original implementation as Codex work. The form draft was filled separately and left unsubmitted for owner review.
