# TinkerSpend agent guide

The owner authorized continuing development in Codex on 24 October 2026. That supersedes the historical Devin-only workflow in `docs/EXECUTION_SPEC.md`; its product, privacy, accounting and free-infrastructure constraints remain applicable.

On 25 October the owner replaced per-app source selection with one disclosed, account-bound automatic capture opt-in plus Android notification access. Preserve local source/sender filtering, no SMS inbox permission, uncertainty/review and current-visible/new-alert capture. See `docs/NOTIFICATION_CAPTURE.md`. Defer visual redesign until the owner gives UI direction.

- Preserve existing work and inspect Git status before editing.
- Use simple, idiomatic code and the repository's existing patterns. Validate inputs and show errors rather than fabricated success.
- Update `CHANGELOG.md`, `AI_USAGE.md`, `docs/PROGRESS.md` and relevant setup/demo documentation for meaningful changes.
- Run appropriate checks. Distinguish mocked services, emulator tests, physical-device tests and deployed checks.
- Commit coherent verified checkpoints with actual timestamps. Never rewrite or backdate the development record.
- Keep secrets, signing material, participant contact details and private financial data out of Git and logs.
- Do not enable paid services. OpenAI API usage is the only authorized new operating expense.
- Keep deployment, real Google sign-in, live model accuracy and physical-phone capture marked pending until actually verified.

Workflow adapted from the organizer-linked [template guide](https://github.com/anima-regem/devday-kochi-hackathon-template/blob/main/AGENTS.md). See [template provenance](docs/TEMPLATE_PROVENANCE.md); copying documentation does not establish event eligibility or GitHub template ancestry.
