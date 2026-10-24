# Change log

## 2026-10-24T21:47:23+05:30 — Codex continuation and submission records

- Changed: strict English monetary-word normalization and independent AI amount validation in domain/API; tests now cover spoken words and prevent balance/invented amounts from being accepted.
- Changed: notification-origin receipt reconciliation integration coverage, receipt browser correction/total-only/attachment/Undo scenarios; added missing Undo control and corrected receipt source label.
- Changed: cross-platform local E2E server, optional installed-Chrome test channel, typed test DB handle and null-safe test assertions; package manager pinned to tested pnpm 11.25.0 with narrowly allowed esbuild/workerd build scripts. Pinned older `workers-types` and `ignore` releases accepted by existing local supply-chain age protection; refreshed lockfile.
- Changed: adapted organizer-linked documentation structure (AGENTS, AI_USAGE, SUBMISSION, template provenance) while preserving the original repository history. Added actual browser screenshots with explicit synthetic/mock provenance and Windows run instructions.
- Why: continue the owner's saved Devin project in Codex, close known local correctness/coverage gaps and make the hackathon repository reviewable.
- Validation: frozen install passed; domain 65/65; local API 40/40 (mocked OpenAI); browser 16/16 (installed Chrome desktop/mobile); lint/typecheck passed; web/native web build and Capacitor sync passed. Screenshots visually inspected. New browser correction tests initially asserted before the asynchronous commit arrived; fixed with a retrying assertion. Bundled Chromium could not launch on this laptop, so the documented installed-Chrome test option was used.
- Limitations: new Android package/JVM check initially blocked by Gradle download timeout, recovery ongoing; live services and physical phone not verified. Original signing keys still require private backup. No deployment, paid services, final submission, history rewrite or merge performed.

## Earlier Devin history

The original development log is preserved in Git and `docs/PROGRESS.md`, `docs/TEST_MATRIX.md`, `docs/CODEX_HANDOFF.md`. Checkpoint `cb9b6871ac8b80201416089ea1050c1d7150019a` was pushed by Devin on 24 October 2026 before Codex continued. This file does not invent retrospective timestamps or claim that the original repository was created from the organizer template.
